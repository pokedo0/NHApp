import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

type SaveFmt = "jpeg" | "png" | "webp";

export type CompressOpts = {
  targetWidth: number;
  quality: number;
  format: SaveFmt;
  headers?: Record<string, string>;
};

const DIR = FileSystem.cacheDirectory + "imgc/";

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function extFor(format: SaveFmt) {
  return format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
}

export async function ensureCompressed(remoteUri: string, opts: CompressOpts) {
  await ensureDir();

  const { targetWidth, quality, format, headers } = opts;
  const key = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA1,
    JSON.stringify({ remoteUri, targetWidth, quality, format })
  );
  const outPath = `${DIR}${key}.${extFor(format)}`;

  const cached = await FileSystem.getInfoAsync(outPath);
  if (cached.exists) return outPath;

  const tmpPath = `${DIR}${key}.orig`;
  try {
    const { uri: downloaded } = await FileSystem.downloadAsync(remoteUri, tmpPath, { headers });

    const actions: ImageManipulator.Action[] = [];
    if (targetWidth && Number.isFinite(targetWidth) && targetWidth > 0) {
      actions.push({ resize: { width: Math.round(targetWidth) } });
    }

    const result = await ImageManipulator.manipulateAsync(
      downloaded,
      actions,
      {
        compress: Math.min(1, Math.max(0, quality)),
        format:
          format === "png"
            ? ImageManipulator.SaveFormat.PNG
            : format === "webp"
            ? ImageManipulator.SaveFormat.WEBP
            : ImageManipulator.SaveFormat.JPEG,
      }
    );

    await FileSystem.moveAsync({ from: result.uri, to: outPath });
    FileSystem.deleteAsync(downloaded).catch(() => {});
    return outPath;
  } catch (e) {
    try { FileSystem.deleteAsync(tmpPath); } catch {}
    return remoteUri;
  }
}

export function pickDefaultFormat(): SaveFmt {
  if (Platform.OS === "android") return "webp";
  return "jpeg";
}
