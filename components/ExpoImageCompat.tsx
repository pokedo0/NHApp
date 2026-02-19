import { Image as ExpoImage, ImageProps } from "expo-image";
import { Platform } from "react-native";
import React from "react";


const isElectron = Platform.OS === "web" && typeof window !== "undefined" && !!(window as any).electron?.isElectron;


export default function ExpoImageCompat(props: ImageProps) {
  let finalResponsivePolicy = props.responsivePolicy;
  if (isElectron) {
    if (!finalResponsivePolicy || finalResponsivePolicy === "static") {
      finalResponsivePolicy = "initial";
    }
  }
  return <ExpoImage {...props} responsivePolicy={finalResponsivePolicy} />;
}