import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import { canAttempt, markFailure, resetUrl } from "./circuitBreaker";
import { retry, withTimeout } from "./retry";

type SaveFmt = "jpeg" | "png" | "webp";

export type CompressOpts = {
  targetWidth: number;
  quality: number;
  format: SaveFmt;
  headers?: Record<string, string>;
  downloadTimeoutMs?: number;
  downloadRetries?: number;
};

const DIR = FileSystem.cacheDirectory + "imgc/";

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists)
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function extFor(format: SaveFmt) {
  return format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
}

async function downloadWithRetry(
  remoteUri: string,
  outTmp: string,
  headers?: Record<string, string>,
  timeoutMs = 10_000,
  retries = 2
) {
  const run = async () => {
    const dl = FileSystem.createDownloadResumable(remoteUri, outTmp, {
      headers,
    });
    try {
      await withTimeout(dl.downloadAsync(), timeoutMs, () => {
        dl.pauseAsync().catch(() => {});
      });
      return true;
    } catch (e) {
      try {
        await FileSystem.deleteAsync(outTmp, { idempotent: true as any });
      } catch {}
      throw e;
    }
  };

  return retry(run, {
    retries,
    baseDelayMs: 250,
    maxDelayMs: 3000,
    factor: 2,
    jitterRatio: 0.3,
    shouldRetry: (e) => {
      const msg = String(e?.message ?? e);
      return /timeout|network|Network|ECONN|ENET|EAI_AGAIN/.test(msg);
    },
  });
}

export async function ensureCompressed(remoteUri: string, opts: CompressOpts) {
  await ensureDir();

  const {
    targetWidth,
    quality,
    format,
    headers,
    downloadTimeoutMs = 10_000,
    downloadRetries = 2,
  } = opts;

  if (!canAttempt(remoteUri)) {
    return remoteUri;
  }

  const key = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA1,
    JSON.stringify({ remoteUri, targetWidth, quality, format })
  );
  const outPath = `${DIR}${key}.${extFor(format)}`;
  const cached = await FileSystem.getInfoAsync(outPath);
  if (cached.exists) {
    return outPath;
  }

  const tmpPath = `${DIR}${key}.orig`;

  try {
    await downloadWithRetry(
      remoteUri,
      tmpPath,
      headers,
      downloadTimeoutMs,
      downloadRetries
    );

    const actions: ImageManipulator.Action[] = [];
    if (targetWidth && Number.isFinite(targetWidth) && targetWidth > 0) {
      actions.push({ resize: { width: Math.round(targetWidth) } });
    }

    const result = await ImageManipulator.manipulateAsync(tmpPath, actions, {
      compress: Math.min(1, Math.max(0, quality)),
      format:
        format === "png"
          ? ImageManipulator.SaveFormat.PNG
          : format === "webp"
          ? ImageManipulator.SaveFormat.WEBP
          : ImageManipulator.SaveFormat.JPEG,
    });

    await FileSystem.moveAsync({ from: result.uri, to: outPath });
    FileSystem.deleteAsync(tmpPath).catch(() => {});
    resetUrl(remoteUri);
    return outPath;
  } catch (e) {
    markFailure(remoteUri);
    try {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true as any });
    } catch {}
    return remoteUri;
  }
}

export function pickDefaultFormat(): SaveFmt {
  if (Platform.OS === "android") return "webp";
  return "jpeg";
}
