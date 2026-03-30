import { Feather } from "@expo/vector-icons";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** Экран отключён — раздел в меню с замком и «Скоро». */
export default function RecommendationsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.card,
          {
            borderColor: colors.sub + "44",
            backgroundColor: colors.page,
          },
        ]}
      >
        <Feather name="lock" size={44} color={colors.sub} />
        <Text style={[styles.title, { color: colors.menuTxt }]}>
          {t("menu.recommendations")}
        </Text>
        <Text style={[styles.sub, { color: colors.accent }]}>
          {t("menu.comingSoon")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 32,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 320,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
  },
  sub: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: 0.5,
  },
});
