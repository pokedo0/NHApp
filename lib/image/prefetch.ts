import { PixelRatio } from "react-native";
import { ensureCompressed, pickDefaultFormat } from "./localCompress";
import { imageProcessingPool } from "./ProcessingPool";
import { imageRequestPool } from "./RequestPool";

export async function prefetchImages(
  urls: string[],
  approxWidth = 320,
  quality = 0.6,
  format = pickDefaultFormat()
) {
  if (!urls?.length) return;
  const pr = Math.max(1, PixelRatio.get() || 1);
  const targetWidth = Math.ceil(approxWidth * pr);

  const releaseProc = await imageProcessingPool.acquire("low");
  const releaseNet = await imageRequestPool.acquire("low");
  try {
    await Promise.allSettled(
      urls.map((u) =>
        ensureCompressed(u, {
          targetWidth,
          quality,
          format,
          downloadRetries: 1,
          downloadTimeoutMs: 6000,
        })
      )
    );
  } finally {
    releaseNet();
    releaseProc();
  }
}
