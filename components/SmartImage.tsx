import { imageProcessingPool } from "@/lib/image/ProcessingPool";
import { imageRequestPool } from "@/lib/image/RequestPool";
import { ensureCompressed, pickDefaultFormat } from "@/lib/image/localCompress";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";
import React, { memo, useEffect, useRef, useState } from "react";
import {
  InteractionManager,
  LayoutChangeEvent,
  PixelRatio,
  Platform,
} from "react-native";

type Priority = "low" | "normal" | "high";
type CachePolicy = "none" | "disk" | "memory" | "memory-disk";

interface Props extends Omit<ExpoImageProps, "source"> {
  sources: string[];
  recyclingKey?: string;
  priority?: Priority;
  cachePolicy?: CachePolicy;
  deferUntilIdle?: boolean;
  clientCompress?: boolean;
  maxTargetWidth?: number;
  compressQuality?: number;
  compressFormat?: "jpeg" | "png" | "webp";
  downloadHeaders?: Record<string, string>;
  downloadTimeoutMs?: number;
  downloadRetries?: number;
  imageRenderTimeoutMs?: number;
  imageRenderRetries?: number;
}

function afterInteractions(): Promise<void> {
  return new Promise((resolve) =>
    InteractionManager.runAfterInteractions(() => resolve())
  );
}

const DEFAULT_RENDER_TIMEOUT = 8000;
const DEFAULT_RENDER_RETRIES = 2;

function SmartImageInner({
  sources,
  recyclingKey,
  priority = "normal",
  cachePolicy = "memory-disk",
  deferUntilIdle = false,
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
  transition = 120,
  downloadTimeoutMs = 10_000,
  downloadRetries = 2,
  imageRenderTimeoutMs = DEFAULT_RENDER_TIMEOUT,
  imageRenderRetries = DEFAULT_RENDER_RETRIES,
  ...rest
}: Props) {
  const [idx, setIdx] = useState(0);
  const [w, setW] = useState<number | null>(null);
  const [localUri, setLocalUri] = useState<string | undefined>(undefined);

  const [reloadToken, setReloadToken] = useState(0);
  const [renderRetriesLeft, setRenderRetriesLeft] =
    useState(imageRenderRetries);

  const mounted = useRef(true);
  const opId = useRef(0);
  const procReleaseRef = useRef<null | (() => void)>(null);
  const netReleaseRef = useRef<null | (() => void)>(null);
  const renderTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      procReleaseRef.current?.();
      procReleaseRef.current = null;
      netReleaseRef.current?.();
      netReleaseRef.current = null;
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
        renderTimerRef.current = null;
      }
    };
  }, []);

  const targetW = (() => {
    if (!w) return undefined;
    const pr = Math.max(1, PixelRatio.get() || 1);
    return Math.min(Math.ceil(w * pr), maxTargetWidth);
  })();

  useEffect(() => {
    setRenderRetriesLeft(imageRenderRetries);
  }, [idx, imageRenderRetries]);

  useEffect(() => {
    let cancelled = false;
    const myOp = ++opId.current;
    setLocalUri(undefined);

    (async () => {
      if (!sources?.length) return;
      if (!(clientCompress && targetW)) return;

      if (deferUntilIdle) await afterInteractions();
      if (cancelled || !mounted.current || myOp !== opId.current) return;

      const procRelease = await imageProcessingPool.acquire(priority);
      procReleaseRef.current = procRelease;

      const netRelease = await imageRequestPool.acquire(priority);
      netReleaseRef.current = netRelease;

      try {
        const uri = await ensureCompressed(sources[idx], {
          targetWidth: targetW,
          quality: compressQuality,
          format: compressFormat,
          headers: downloadHeaders,
          downloadTimeoutMs,
          downloadRetries,
        });
        if (!cancelled && mounted.current && myOp === opId.current) {
          setLocalUri(uri);
        }
      } finally {
        netReleaseRef.current?.();
        netReleaseRef.current = null;
        procReleaseRef.current?.();
        procReleaseRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sources,
    idx,
    clientCompress,
    targetW,
    compressQuality,
    compressFormat,
    downloadHeaders,
    priority,
    deferUntilIdle,
    downloadTimeoutMs,
    downloadRetries,
  ]);

  if (!sources || sources.length === 0) return null;

  const bumpReload = () => setReloadToken((x) => x + 1);

  const scheduleRenderTimeout = () => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    if (imageRenderTimeoutMs <= 0) return;
    renderTimerRef.current = setTimeout(() => {
      if (!mounted.current) return;
      if (renderRetriesLeft > 0) {
        setRenderRetriesLeft((n) => n - 1);
        bumpReload();
      } else {
        if (idx + 1 < sources.length) {
          setIdx((x) => x + 1);
          setLocalUri(undefined);
          setRenderRetriesLeft(imageRenderRetries);
        } else {
          onError?.({} as any);
        }
      }
    }, imageRenderTimeoutMs);
  };

  const handleError: NonNullable<ExpoImageProps["onError"]> = () => {
    if (renderRetriesLeft > 0) {
      setRenderRetriesLeft((n) => n - 1);
      bumpReload();
    } else if (idx + 1 < sources.length) {
      setIdx((x) => x + 1);
      setLocalUri(undefined);
      setRenderRetriesLeft(imageRenderRetries);
    } else {
      onError?.({} as any);
    }
  };

  const handleLoadStart: NonNullable<ExpoImageProps["onLoadStart"]> = () => {
    scheduleRenderTimeout();
  };

  const handleLoadEnd: NonNullable<ExpoImageProps["onLoadEnd"]> = () => {
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }
    onLoadEnd?.();
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = Math.max(1, Math.floor(e.nativeEvent.layout.width));
    setW(width);
    onLayout?.(e);
  };

  const decodeFormat =
    Platform.OS === "android" ? ("rgb" as const) : (undefined as any);
  const currentSource = clientCompress && localUri ? localUri : sources[idx];

  return (
    <ExpoImage
      {...rest}
      key={`img-${idx}-${reloadToken}`}
      style={style}
      onLayout={handleLayout}
      source={currentSource}
      recyclingKey={recyclingKey}
      cachePolicy={cachePolicy}
      priority={priority}
      contentFit={contentFit}
      placeholderContentFit={placeholderContentFit ?? (contentFit as any)}
      decodeFormat={decodeFormat as any}
      transition={transition}
      onLoadStart={handleLoadStart}
      onError={handleError}
      onLoadEnd={handleLoadEnd}
    />
  );
}

export default memo(SmartImageInner);
