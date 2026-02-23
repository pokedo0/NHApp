import { getElectronVersion, isElectron } from "@/electron/bridge";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

export default function SettingsLayout({
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = isElectron() || (Platform.OS === "web" && width >= 768);
  const isTablet = width >= 600 && width < 768;
  const [electronVersion, setElectronVersion] = useState<string | null>(null);
  useEffect(() => {
    if (isElectron()) getElectronVersion().then(setElectronVersion);
  }, []);
  const versionDisplay = isElectron() && electronVersion != null
    ? electronVersion
    : Constants.expoConfig?.version ?? "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={[styles.page, { backgroundColor: colors.bg }]}
        contentContainerStyle={[
          styles.container,
          isDesktop && styles.containerDesktop,
          isTablet && styles.containerTablet,
          { paddingTop: isDesktop ? 24 : 12, paddingBottom: isDesktop ? 48 : 32 }
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={[
          styles.content,
          isDesktop && styles.contentDesktop,
          isTablet && styles.contentTablet,
        ]}>
          {children}
        </View>
        <View style={styles.footer}>
          <Text style={[styles.caption, { color: colors.sub }]}>
            v{versionDisplay} {t("app.version.beta")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  container: {
    paddingHorizontal: 16,
  },
  containerDesktop: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  containerTablet: {
    paddingHorizontal: 32,
  },
  content: {
    width: "100%",
  },
  contentDesktop: {
    maxWidth: 800,
    width: "100%",
  },
  contentTablet: {
    maxWidth: 700,
    width: "100%",
    alignSelf: "center",
  },
  footer: {
    marginTop: 32,
    marginBottom: 16,
    alignItems: "center",
  },
  caption: { 
    textAlign: "center", 
    opacity: 0.6, 
    fontSize: 12,
    letterSpacing: 0.3,
  },
});
