import { imageProcessingPool } from "@/lib/image/ProcessingPool";
import { imageRequestPool } from "@/lib/image/RequestPool";
import { ensureCompressed, pickDefaultFormat } from "@/lib/image/localCompress";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";
import React, { memo, useEffect, useRef, useState } from "react";
import { InteractionManager, LayoutChangeEvent, PixelRatio, Platform, StyleProp, View, ViewStyle } from "react-native";

type Priority = "low" | "normal" | "high";
type CachePolicy = "none" | "disk" | "memory" | "memory-disk";

interface Props extends Omit<ExpoImageProps, "source"> {
  sources: string[];
  recyclingKey?: string;
  priority?: Priority;
  cachePolicy?: CachePolicy;
  deferUntilIdle?: boolean;
  reserveStyle?: StyleProp<ViewStyle>;
  clientCompress?: boolean;
  maxTargetWidth?: number;
  compressQuality?: number;
  compressFormat?: "jpeg" | "png" | "webp";
  downloadHeaders?: Record<string, string>;
}

function runAfterInteractionsSafe(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

function SmartImageInner({
  sources,
  recyclingKey,
  priority = "normal",
  cachePolicy = "memory-disk",
  deferUntilIdle = true,
  reserveStyle,
  style,
  onError,
  onLoadEnd,
  onLayout,
  contentFit = "cover",
  placeholderContentFit,
  clientCompress = true,
  maxTargetWidth = 720,
  compressQuality = 0.68,
  compressFormat = pickDefaultFormat(),
  downloadHeaders,
  ...rest
}: Props) {
  const [idx, setIdx] = useState(0);
  const [canLoad, setCanLoad] = useState(false);
  const [layoutW, setLayoutW] = useState<number | null>(null);
  const [localUri, setLocalUri] = useState<string | undefined>(undefined);

  const netReleaseRef = useRef<null | (() => void)>(null);
  const procReleaseRef = useRef<null | (() => void)>(null);
  const mounted = useRef(true);
  const opId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      if (deferUntilIdle) await runAfterInteractionsSafe();
      const release = await imageRequestPool.acquire();
      if (!mounted.current) {
        release();
        return;
      }
      netReleaseRef.current = release;
      setCanLoad(true);
    })();

    return () => {
      mounted.current = false;
      netReleaseRef.current?.(); netReleaseRef.current = null;
      procReleaseRef.current?.(); procReleaseRef.current = null;
    };
  }, [deferUntilIdle, sources.join("|")]);

  const computeTargetWidth = (w: number | null) => {
    if (!w) return undefined;
    const pr = Math.max(1, PixelRatio.get() || 1);
    const target = Math.ceil(w * pr);
    return Math.min(target, maxTargetWidth);
  };
  const targetW = computeTargetWidth(layoutW);

  useEffect(() => {
    let cancelled = false;
    const myOp = ++opId.current;

    (async () => {
      if (!sources?.length || !canLoad) return;
      if (!clientCompress) {
        if (!cancelled && opId.current === myOp) {
          setLocalUri(sources[idx]);
        }
        return;
      }
      if (!targetW) return;

      const procRelease = await imageProcessingPool.acquire();
      if (cancelled || opId.current !== myOp) {
        procRelease();
        return;
      }
      procReleaseRef.current = procRelease;

      try {
        const uri = await ensureCompressed(sources[idx], {
          targetWidth: targetW,
          quality: compressQuality,
          format: compressFormat,
          headers: downloadHeaders,
        });

        if (!cancelled && opId.current === myOp) {
          setLocalUri(uri);
        }
      } finally {
        procReleaseRef.current?.();
        procReleaseRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sources, idx, canLoad, clientCompress, targetW,
    compressQuality, compressFormat, downloadHeaders
  ]);

  if (!sources || sources.length === 0) return null;

  const handleError: NonNullable<ExpoImageProps["onError"]> = (e) => {
    if (idx + 1 < sources.length) {
      setIdx((x) => x + 1);
      setLocalUri(undefined);
    } else {
      onError?.(e);
    }
  };

  const handleLoadEnd: NonNullable<ExpoImageProps["onLoadEnd"]> = () => {
    netReleaseRef.current?.(); netReleaseRef.current = null;
    onLoadEnd?.();
  };

  const decodeFormat = Platform.OS === "android" ? ("rgb" as const) : (undefined as any);

  const handleLayout = (e: LayoutChangeEvent) => {
    setLayoutW(Math.max(1, Math.floor(e.nativeEvent.layout.width)));
    onLayout?.(e);
  };

  const shouldWait = clientCompress && (!targetW || !localUri);

  return !shouldWait ? (
    <ExpoImage
      {...rest}
      style={style}
      onLayout={handleLayout}
      source={clientCompress ? localUri! : sources[idx]}
      recyclingKey={recyclingKey}
      cachePolicy={cachePolicy}
      priority={priority}
      contentFit={contentFit}
      placeholderContentFit={placeholderContentFit ?? (contentFit as any)}
      decodeFormat={decodeFormat as any}
      transition={120}
      onError={handleError}
      onLoadEnd={handleLoadEnd}
    />
  ) : (
    <View onLayout={handleLayout} style={reserveStyle ?? style} />
  );
}

export default memo(SmartImageInner);
