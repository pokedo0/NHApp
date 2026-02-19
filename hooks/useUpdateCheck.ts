import * as Application from "expo-application";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, ToastAndroid } from "react-native";
type UpdateInfo = {
  versionName: string;
  notes: string;
  apkUrl: string;
};
export function useUpdateCheck() {
  const [update,   setUpdate]   = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const checkUpdate = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.github.com/repos/Maks1mio/NHAppAndroid/releases/latest"
      );
      const j       = await res.json();
      const tag     = j.tag_name as string;
      const current =
        Constants.expoConfig?.version ?? Application.nativeBuildVersion;
      if (tag && tag !== current && j.assets?.length) {
        setUpdate({
          versionName: tag,
          notes: j.body ?? "",
          apkUrl: j.assets[0].browser_download_url,
        });
      } else {
        setUpdate(null);
      }
    } catch (e) {
      console.warn("[update-check]", e);
    }
  }, []);
  useEffect(() => { checkUpdate(); }, [checkUpdate]);
  const launchInstaller = async (file: string) => {
    const uri = await FileSystem.getContentUriAsync(file);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data : uri,
      type : "application/vnd.android.package-archive",
      flags: 1 | 0x10000000,
    });
  };
  const downloadAndInstall = useCallback(async () => {
    if (!update || progress !== null) return;
    if (Platform.OS === "android" && (Platform.Version as number) >= 26) {
      ToastAndroid.show("Скачивание через браузер…", ToastAndroid.SHORT);
      Linking.openURL(update.apkUrl);
      return;
    }
    try {
      const dest = `${FileSystem.documentDirectory}NHApp_update.apk`;
      setProgress(0);
      await FileSystem.createDownloadResumable(
        update.apkUrl,
        dest,
        { headers: { Accept: "application/octet-stream" } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) =>
          setProgress(totalBytesWritten / totalBytesExpectedToWrite)
      ).downloadAsync();
      setProgress(null);
      ToastAndroid.show("APK загружен, открываю установщик…", ToastAndroid.SHORT);
      await launchInstaller(dest);
    } catch (e) {
      console.error("[update-dl]", e);
      ToastAndroid.show("Ошибка загрузки", ToastAndroid.LONG);
      setProgress(null);
    }
  }, [update, progress]);
  return { update, progress, downloadAndInstall, checkUpdate };
}
