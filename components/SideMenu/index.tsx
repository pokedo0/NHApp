import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    Image,
    LayoutChangeEvent,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getRandomBook } from "@/api/nhentai";
import { LIBRARY_MENU } from "@/constants/Menu";
import { useAuthBridge } from "@/hooks/useAuthBridge";
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";
import type { MenuRoute } from "@/types/routes";
import { LoginModal } from "./LoginModal";

import { CardPressable } from "@/components/ui/CardPressable";
import { IconBtn } from "@/components/ui/IconBtn";
import { Section } from "@/components/ui/Section";

export default function SideMenu({
  closeDrawer,
  fullscreen,
}: {
  closeDrawer: () => void;
  fullscreen: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const {
    me,
    doLogout,
    canUseNativeJar,
    isExpoGo,
    wvBusy,
    setWvBusy,
    csrfInput,
    setCsrfInput,
    sessInput,
    setSessInput,
    applyManual,
    refreshTokensFromJar,
    fetchMeAndMaybeClose,
    handleNavChange,
    onWvMessage,
  } = useAuthBridge(t);

  const [randomLoading, setRandomLoading] = React.useState(false);
  const [loginVisible, setLoginVisible] = React.useState(false);
  React.useEffect(() => {
    if (loginVisible && me) setLoginVisible(false);
  }, [loginVisible, me]);

  const isLandscape = width > height;
  const TOKENS = React.useMemo(
    () => ({
      padX: 14,
      padY: 12,
      radius: isLandscape ? 12 : 14,
      icon: isLandscape ? 16 : 18,
      itemMinH: isLandscape ? 44 : 50,
      footerH: isLandscape ? 72 : 84,
      gap: 8,
      titleSize: 16,
    }),
    [isLandscape]
  );

  const dynamicTop = fullscreen ? 8 : Math.max(insets.top, 8);
  const loggedIn = !!me;

  const ripplePrimary = "#FFFFFF33";
  const rippleItem = colors.accent + "33";
  const rippleSubtle = colors.accent + "22";
  const overlayStrong = "rgba(255,255,255,0.12)";
  const overlaySoft = "rgba(255,255,255,0.08)";

  const goTo = React.useCallback(
    (route: MenuRoute) => {
      closeDrawer();
      router.push(route);
    },
    [closeDrawer, router]
  );

  const goRandom = React.useCallback(async () => {
    if (randomLoading) return;
    try {
      setRandomLoading(true);
      const b = await getRandomBook();
      closeDrawer();
      router.push({
        pathname: "/book/[id]",
        params: { id: String(b.id), title: b.title.pretty, random: "1" },
      });
    } finally {
      setRandomLoading(false);
    }
  }, [randomLoading, closeDrawer, router]);

  const [viewportH, setViewportH] = React.useState(0);
  const [contentH, setContentH] = React.useState(0);
  const scrollEnabled = contentH > viewportH + 1;

  const onScrollViewLayout = (e: LayoutChangeEvent) => {
    setViewportH(e.nativeEvent.layout.height);
  };
  const onContentSizeChange = (_w: number, h: number) => {
    setContentH(h);
  };

  React.useEffect(() => {
    setContentH(0);
  }, [width, height, loggedIn]);

  return (
    <View style={[styles.root, { backgroundColor: colors.menuBg }]}>
      <ScrollView
        style={{ flex: 1 }}
        onLayout={onScrollViewLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEnabled={scrollEnabled}
        bounces={scrollEnabled}
        alwaysBounceVertical={false}
        overScrollMode={scrollEnabled ? "auto" : "never"}
        showsVerticalScrollIndicator={scrollEnabled}
        contentContainerStyle={{
          paddingTop: dynamicTop,
          paddingHorizontal: TOKENS.padX,
          paddingBottom: scrollEnabled ? 8 : 0,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.headerRow, { marginBottom: 12 }]}>
          <View>
            <Text
              style={{
                color: colors.menuTxt,
                fontWeight: "900",
                fontSize: TOKENS.titleSize,
              }}
            >
              {t("menu.brand")}
            </Text>
            <Text style={{ color: colors.sub, fontSize: 11 }}>
              {t("menu.brandTag")}
            </Text>
          </View>
        </View>

        <CardPressable
          ripple={ripplePrimary}
          overlayColor={overlayStrong}
          radius={TOKENS.radius}
          onPress={goRandom}
          disabled={randomLoading}
          accessibilityLabel={t("menu.random")}
          pressedScale={0.98}
        >
          <View
            style={{
              minHeight: TOKENS.itemMinH,
              backgroundColor: colors.accent,
              borderRadius: TOKENS.radius,
              paddingVertical: TOKENS.padY,
              paddingHorizontal: TOKENS.padX,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            {randomLoading ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Feather name="shuffle" size={TOKENS.icon} color={colors.bg} />
            )}
            <Text
              style={{
                color: colors.bg,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 0.2,
              }}
            >
              {t("menu.random")}
            </Text>
          </View>
        </CardPressable>

        <Section
          title={t("menu.section.library")}
          color={colors.sub}
          dividerColor={colors.page}
          dense={isLandscape}
          style={{ marginTop: 14, marginBottom: 8 }}
        />

        <View style={{ gap: TOKENS.gap }}>
          {LIBRARY_MENU.map((item) => {
            const active = pathname?.startsWith(item.route);
            const disabled = !loggedIn && item.route === "/favoritesOnline";
            const tint = disabled
              ? colors.sub
              : active
              ? colors.accent
              : colors.menuTxt;
            const tileBg = active ? colors.accent + "14" : colors.tagBg;
            const tileBorder = active ? colors.accent + "66" : colors.page;

            return (
              <CardPressable
                key={item.route}
                ripple={rippleItem}
                overlayColor={overlaySoft}
                radius={TOKENS.radius}
                onPress={() => !disabled && goTo(item.route)}
                disabled={disabled}
                accessibilityLabel={t(item.labelKey)}
                pressedScale={0.99}
              >
                <View
                  style={{
                    minHeight: TOKENS.itemMinH,
                    backgroundColor: tileBg,
                    borderRadius: TOKENS.radius,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: tileBorder,
                    paddingVertical: TOKENS.padY - 2,
                    paddingHorizontal: TOKENS.padX,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Feather
                      name={item.icon as any}
                      size={TOKENS.icon}
                      color={tint}
                    />
                  </View>
                  <Text
                    style={{
                      color: tint,
                      fontSize: 13,
                      fontWeight: "900",
                      letterSpacing: 0.2,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {t(item.labelKey)}
                  </Text>
                  {disabled ? (
                    <Feather name="lock" size={14} color={colors.sub} />
                  ) : (
                    <Feather name="chevron-right" size={18} color={tint} />
                  )}
                </View>
              </CardPressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.menuBg,
            borderTopColor: colors.page,
            paddingBottom: insets.bottom + 10,
            paddingHorizontal: TOKENS.padX,
            paddingTop: 10,
          },
        ]}
      >
        {loggedIn ? (
          <CardPressable
            ripple={rippleSubtle}
            overlayColor={overlaySoft}
            radius={TOKENS.radius}
            onPress={() => {
              if (!me) return;
              const slug = (
                me.slug ||
                me.username ||
                String(me.id || "")
              ).toString();
              router.push({
                pathname: "/profile/[id]/[slug]",
                params: { id: String(me.id ?? ""), slug },
              });
              closeDrawer();
            }}
            accessibilityLabel={t("menu.profile")}
            pressedScale={0.99}
          >
            <View
              style={{
                minHeight: TOKENS.footerH - 16,
                borderRadius: TOKENS.radius,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: colors.accent + "12",
                paddingVertical: TOKENS.padY - 2,
                paddingHorizontal: TOKENS.padX,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              {me?.avatar_url ? (
                <Image
                  source={{ uri: me.avatar_url }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "#0002",
                  }}
                  accessibilityLabel={t("menu.avatar")}
                />
              ) : (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.accent + "22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="user" size={18} color={colors.accent} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: colors.menuTxt, fontWeight: "900" }}
                  numberOfLines={1}
                >
                  {me?.username}
                </Text>
                {!!me?.profile_url && (
                  <Text
                    style={{ color: colors.sub, fontSize: 11 }}
                    numberOfLines={1}
                  >
                    {me.profile_url}
                  </Text>
                )}
              </View>
              <IconBtn
                ripple={rippleSubtle}
                overlayColor={overlaySoft}
                onPress={doLogout}
                accessibilityLabel={t("menu.logout")}
                shape="circle"
                size={36}
              >
                <Feather name="log-out" size={18} color={colors.accent} />
              </IconBtn>
            </View>
          </CardPressable>
        ) : (
          <CardPressable
            ripple={rippleSubtle}
            overlayColor={overlaySoft}
            radius={TOKENS.radius}
            onPress={() => setLoginVisible(true)}
            accessibilityLabel={t("menu.login")}
            pressedScale={0.99}
          >
            <View
              style={{
                minHeight: TOKENS.footerH - 16,
                borderRadius: TOKENS.radius,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: colors.accent + "10",
                paddingVertical: TOKENS.padY - 2,
                paddingHorizontal: TOKENS.padX,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Feather name="log-in" size={TOKENS.icon} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: "900" }}>
                {t("menu.login")}
              </Text>
            </View>
          </CardPressable>
        )}
      </View>

      <LoginModal
        visible={loginVisible}
        onRequestClose={() => setLoginVisible(false)}
        colors={colors}
        t={t}
        canUseNativeJar={canUseNativeJar}
        isExpoGo={isExpoGo}
        wvBusy={wvBusy}
        setWvBusy={setWvBusy}
        csrfInput={csrfInput}
        setCsrfInput={setCsrfInput}
        sessInput={sessInput}
        setSessInput={setSessInput}
        applyManual={applyManual}
        refreshTokensFromJar={refreshTokensFromJar}
        fetchMeAndMaybeClose={fetchMeAndMaybeClose}
        handleNavChange={handleNavChange}
        onWvMessage={onWvMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
