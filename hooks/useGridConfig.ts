import type { GridConfig } from "@/components/BookList";
import {
  getCurrentGridConfigMapSync,
  getGridConfigMap,
  subscribeGridConfig,
} from "@/config/gridConfig";
import { useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";
export function useGridConfig(): GridConfig {
  const { width, height } = useWindowDimensions();
  const [map, setMap] = useState(getCurrentGridConfigMapSync());
  useEffect(() => {
    const unsub = subscribeGridConfig(setMap);
    getGridConfigMap()
      .then(setMap)
      .catch(() => {});
    return () => unsub();
  }, []);
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;
  if (isTablet) return isLandscape ? map.tabletLandscape : map.tabletPortrait;
  return isLandscape ? map.phoneLandscape : map.phonePortrait;
}
