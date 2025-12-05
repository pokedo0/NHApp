import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

// Material 3 / Google Design Tokens
const M3_RADIUS = 12; // Компактный радиус
const M3_SPACING = 12;
const M3_RAIL_ITEM_SIZE = 48; // Стандартный размер M3 для области взаимодействия

const PARTICLE_COUNT = 8;

type SideMenuProps = {
  closeDrawer: () => void;
  fullscreen: boolean;

  /** true, если в layout используется permanent-меню (планшет в альбомной ориентации) */
  isTabletPermanent?: boolean;
  /** текущее состояние коллапса меню (контролируется из _layout.tsx) */
  collapsed?: boolean;
  /** переключатель коллапса */
  onToggleCollapsed?: () => void;
};

type ParticleConfig = {
  dx: number;
  dy: number;
  startScale: number;
  endScale: number;
  duration: number;
  delay: number;
  startX: number;
  startY: number;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Конфиг частицы:
 * - стартовая позиция равномерно по всей площади кнопки (с безопасным отступом по краям)
 * - направление и дистанция полёта — рандомно во все стороны
 */
function createRandomParticleConfig(layout: {
  width: number;
  height: number;
}): ParticleConfig {
  const { width, height } = layout;

  // Отступ от краёв, чтобы частица не рождалась прямо в границе
  const marginX = width * 0.1;
  const marginY = height * 0.2;

  const startX = randomBetween(marginX, width - marginX);
  const startY = randomBetween(marginY, height - marginY);

  // Случайное направление полёта (во все стороны)
  const moveAngle = randomBetween(0, Math.PI * 2);

  // Дистанцию полёта чуть масштабируем от размеров кнопки,
  // чтобы эффект был адекватен и на широкой, и на узкой кнопке
  const base = Math.min(width, height);
  const distance = randomBetween(base * 0.25, base * 0.7);

  const dx = Math.cos(moveAngle) * distance;
  const dy = Math.sin(moveAngle) * distance;

  const duration = randomBetween(900, 1500); // 0.9–1.5s
  const delay = randomBetween(0, 900); // рандомный старт

  const startScale = randomBetween(0.5, 0.9);
  const endScale = randomBetween(1.1, 1.6);

  return {
    dx,
    dy,
    startScale,
    endScale,
    duration,
    delay,
    startX,
    startY,
  };
}

export default function SideMenu({
  closeDrawer,
  fullscreen,
  isTabletPermanent = false,
  collapsed = false,
  onToggleCollapsed,
}: SideMenuProps) {
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

  // меню реально может быть "узким" только когда оно permanent (планшет landscape)
  const isRail = isTabletPermanent && isLandscape && collapsed;

  // Токены, адаптированные для максимально компактного дизайна в Rail-режиме
  const TOKENS = React.useMemo(
    () => ({
      padX: isRail ? 8 : M3_SPACING, // Горизонтальный отступ
      padY: isRail ? 4 : 8, // Уменьшенный вертикальный отступ для пунктов
      radius: M3_RADIUS,
      icon: 20, // Единый размер иконки для соразмерности
      itemMinH: isRail ? M3_RAIL_ITEM_SIZE : 44, // Минимальная высота пункта
      footerH: isRail ? 64 : 70, // Высота подвала
      gap: isRail ? 2 : 6, // Минимальный зазор между пунктами в Rail-режиме
      titleSize: isRail ? 0 : 20, // Размер шрифта заголовка
      itemTextSize: 13, // Размер текста пункта
      itemIconTextGap: isRail ? 0 : 12, // Зазор иконка/текст
    }),
    [isLandscape, isRail]
  );

  const dynamicTop = fullscreen ? 8 : 8;
  const loggedIn = !!me;

  // Google/Material 3 ripples and overlays
  const ripplePrimary = colors.accent + "A0";
  const rippleItem = colors.accent + "44";
  const overlaySoft = colors.sub + "10";

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

  const goToDiscord = React.useCallback(() => {
    closeDrawer();
    console.log("Navigating to Discord");
  }, [closeDrawer]);

  const goToProfile = React.useCallback(() => {
    if (!me) return;
    const slug = (me.slug || me.username || String(me.id || "")).toString();
    router.push({
      pathname: "/profile/[id]/[slug]",
      params: { id: String(me.id ?? ""), slug },
    });
    closeDrawer();
  }, [me, router, closeDrawer]);

  const [viewportH, setViewportH] = React.useState(0);
  const [contentH, setContentH] = React.useState(0);
  const scrollEnabled = contentH > viewportH + 5;

  const onScrollViewLayout = (e: LayoutChangeEvent) => {
    setViewportH(e.nativeEvent.layout.height);
  };
  const onContentSizeChange = (_w: number, h: number) => {
    setContentH(h);
  };

  React.useEffect(() => {
    setContentH(0);
  }, [width, height, loggedIn, isRail]);

  // === ✨ ПАРТИКЛЫ ДЛЯ DISCORD-КНОПКИ ===
  const [discordLayout, setDiscordLayout] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  const particleValues = React.useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))
  ).current;

  const [particleConfigs, setParticleConfigs] = React.useState<ParticleConfig[]>(
    []
  );

  React.useEffect(() => {
    if (!discordLayout) return;

    let cancelled = false;

    setParticleConfigs(
      Array.from({ length: PARTICLE_COUNT }, () =>
        createRandomParticleConfig(discordLayout)
      )
    );
    particleValues.forEach((v) => v.setValue(0));

    function runParticle(index: number) {
      if (cancelled || !discordLayout) return;

      const cfg = createRandomParticleConfig(discordLayout);

      setParticleConfigs((prev) => {
        const next = [...prev];
        next[index] = cfg;
        return next;
      });

      const v = particleValues[index];
      v.setValue(0);

      Animated.timing(v, {
        toValue: 1,
        duration: cfg.duration,
        delay: cfg.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) {
          runParticle(index); // бесконечный цикл
        }
      });
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      runParticle(i);
    }

    return () => {
      cancelled = true;
      particleValues.forEach((v: any) => {
        if (v.stopAnimation) v.stopAnimation();
      });
    };
  }, [discordLayout, particleValues]);

  // Helper component for Navigation Rail Item (M3 Style)
  const MenuItem = ({
    item,
    active,
    disabled,
  }: {
    item: { route: MenuRoute; icon: string; labelKey: string };
    active: boolean;
    disabled: boolean;
  }) => {
    const tint = disabled
      ? colors.sub
      : active
      ? colors.accent
      : colors.menuTxt;

    const tileBg = active ? colors.accent + "1A" : "transparent";
    const fontWeight = active ? "600" : "500";

    return (
      <CardPressable
        ripple={rippleItem}
        overlayColor={overlaySoft}
        radius={TOKENS.radius}
        onPress={() => !disabled && goTo(item.route)}
        disabled={disabled}
        accessibilityLabel={t(item.labelKey)}
        pressedScale={0.98}
      >
        <View
          style={{
            minHeight: TOKENS.itemMinH,
            backgroundColor: tileBg,
            borderRadius: TOKENS.radius,
            paddingVertical: TOKENS.padY,
            paddingHorizontal: isRail ? 4 : TOKENS.padX,
            flexDirection: "row",
            alignItems: "center",
            gap: TOKENS.itemIconTextGap,
            justifyContent: isRail ? "center" : "flex-start",
          }}
        >
          <View
            style={{
              width: isRail ? M3_RAIL_ITEM_SIZE : TOKENS.icon,
              height: isRail ? M3_RAIL_ITEM_SIZE : TOKENS.icon,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather
              name={item.icon as any}
              size={TOKENS.icon}
              color={tint}
            />
          </View>

          {!isRail && (
            <>
              <Text
                style={{
                  color: tint,
                  fontSize: TOKENS.itemTextSize,
                  fontWeight: fontWeight as any,
                  letterSpacing: 0.1,
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
            </>
          )}
        </View>
      </CardPressable>
    );
  };

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
        showsVerticalScrollIndicator={scrollEnabled && !isRail}
        contentContainerStyle={{
          paddingTop: dynamicTop,
          paddingHorizontal: TOKENS.padX,
          paddingBottom: scrollEnabled ? 8 : 0,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Бренд / заголовок */}
        <View
          style={[
            styles.headerRow,
            {
              marginBottom: isRail ? 12 : 16,
              paddingVertical: isRail ? 0 : 4,
              justifyContent: isRail ? "center" : "space-between",
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: isRail ? 0 : 8,
            }}
          >
            <View
              style={{
                width: isRail ? 32 : 36,
                height: isRail ? 32 : 36,
                borderRadius: isRail ? 16 : 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accent + "22",
              }}
            >
              <Feather name="book-open" size={18} color={colors.accent} />
            </View>

            {!isRail && (
              <View>
                <Text
                  style={{
                    color: colors.menuTxt,
                    fontWeight: "700",
                    fontSize: TOKENS.titleSize,
                    letterSpacing: -0.5,
                  }}
                >
                  {t("menu.brand")}
                </Text>
                <Text
                  style={{
                    color: colors.sub,
                    fontSize: 11,
                    opacity: 0.8,
                    fontWeight: "400",
                  }}
                >
                  {t("menu.brandTag")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Основная навигация (Библиотека) */}
        {!isRail && (
          <Section
            title={t("menu.section.library")}
            color={colors.sub}
            dividerColor={colors.sub + "33"}
            dense={true}
            style={{ marginBottom: TOKENS.gap / 2, marginTop: TOKENS.gap / 2 }}
          />
        )}

        <View style={{ gap: TOKENS.gap }}>
          {LIBRARY_MENU.map((item) => {
            const active = pathname?.startsWith(item.route);
            const disabled = !loggedIn && item.route === "/favoritesOnline";
            return (
              <MenuItem
                key={item.route}
                item={item as any}
                active={active}
                disabled={disabled}
              />
            );
          })}
        </View>

        {/* Случайная книга */}
        <CardPressable
          ripple={ripplePrimary}
          overlayColor={"transparent"}
          radius={M3_RADIUS}
          onPress={goRandom}
          disabled={randomLoading}
          accessibilityLabel={t("menu.random")}
          pressedScale={0.97}
        >
          <View
            style={{
              minHeight: isRail ? M3_RAIL_ITEM_SIZE : 48,
              backgroundColor: colors.accent,
              borderRadius: M3_RADIUS,
              paddingVertical: TOKENS.padY,
              paddingHorizontal: TOKENS.padX,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              justifyContent: isRail ? "center" : "flex-start",
              marginTop: isRail ? 12 : 12,
            }}
          >
            {randomLoading ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Feather name="shuffle" size={TOKENS.icon} color={colors.bg} />
            )}
            {!isRail && (
              <Text
                style={{
                  color: colors.bg,
                  fontSize: 14,
                  fontWeight: "600",
                  letterSpacing: 0.5,
                }}
              >
                {t("menu.random").toUpperCase()}
              </Text>
            )}
          </View>
        </CardPressable>

        {/* Разделитель перед Discord */}
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.sub + "33",
            marginVertical: isRail ? 12 : 16,
          }}
        />

        {/* Discord + частицы */}
        <CardPressable
          ripple={rippleItem}
          overlayColor={overlaySoft}
          radius={TOKENS.radius}
          onPress={goToDiscord}
          pressedScale={0.98}
        >
          <View
            style={{
              minHeight: TOKENS.itemMinH,
              borderRadius: TOKENS.radius,
              paddingVertical: TOKENS.padY,
              paddingHorizontal: isRail ? 4 : TOKENS.padX,
              flexDirection: "row",
              alignItems: "center",
              gap: isRail ? 0 : 12,
              backgroundColor: colors.menuBg,
              justifyContent: isRail ? "center" : "flex-start",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.accent + "44",
              position: "relative",
              overflow: "hidden",
            }}
            onLayout={(e) => {
              const { width: w, height: h } = e.nativeEvent.layout;
              setDiscordLayout({ width: w, height: h });
            }}
          >
            {/* ✨ Частицы-звёздочки: рождаются по всей кнопке, летят в разные стороны */}
            {!isRail &&
              discordLayout &&
              particleConfigs.length === PARTICLE_COUNT &&
              particleConfigs.map((cfg, index) => {
                const progress = particleValues[index];

                const translateX = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, cfg.dx],
                });

                const translateY = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, cfg.dy],
                });

                const scale = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [cfg.startScale, cfg.endScale],
                });

                const opacity = progress.interpolate({
                  inputRange: [0, 0.15, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                });

                const size = 6 + ((index * 2) % 6);
                const colorVariant =
                  index % 3 === 0
                    ? colors.accent + "FF"
                    : index % 3 === 1
                    ? colors.accent + "CC"
                    : colors.accent + "AA";

                return (
                  <Animated.View
                    key={index}
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: cfg.startX,
                      top: cfg.startY,
                      opacity,
                      transform: [{ translateX }, { translateY }, { scale }],
                    }}
                  >
                    <Feather name="star" size={size} color={colorVariant} />
                  </Animated.View>
                );
              })}

            <View
              style={{
                width: isRail ? M3_RAIL_ITEM_SIZE : TOKENS.icon,
                height: isRail ? M3_RAIL_ITEM_SIZE : TOKENS.icon,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather
                name="message-circle"
                size={TOKENS.icon}
                color={colors.accent}
              />
            </View>
            {!isRail && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: "600",
                    letterSpacing: 0.1,
                  }}
                  numberOfLines={1}
                >
                  {t("menu.discordJoin")}
                </Text>
                <Text
                  style={{
                    color: colors.sub,
                    fontSize: 10,
                    marginTop: 1,
                  }}
                  numberOfLines={2}
                >
                  {t("menu.discordSubtitle")}
                </Text>
              </View>
            )}
            {!isRail && (
              <Feather name="arrow-up-right" size={14} color={colors.accent} />
            )}
          </View>
        </CardPressable>

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Подвал */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.menuBg,
            paddingBottom: insets.bottom + 8,
            paddingHorizontal: TOKENS.padX,
            paddingTop: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.sub + "33",
          },
        ]}
      >
        {loggedIn ? (
          isRail ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                height: TOKENS.footerH - 16,
              }}
            >
              <IconBtn
                ripple={rippleItem}
                overlayColor={overlaySoft}
                onPress={goToProfile}
                shape="circle"
                size={44}
              >
                {me?.avatar_url ? (
                  <Image
                    source={{ uri: me.avatar_url }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.accent + "22",
                    }}
                  />
                ) : (
                  <Feather name="user" size={20} color={colors.accent} />
                )}
              </IconBtn>
            </View>
          ) : (
            <CardPressable
              ripple={rippleItem}
              overlayColor={overlaySoft}
              radius={TOKENS.radius + 4}
              onPress={goToProfile}
              accessibilityLabel={t("menu.profile")}
              pressedScale={0.99}
            >
              <View
                style={{
                  minHeight: TOKENS.footerH - 16,
                  borderRadius: TOKENS.radius + 4,
                  backgroundColor: colors.accent + "10",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {me?.avatar_url ? (
                  <Image
                    source={{ uri: me.avatar_url }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.accent + "22",
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
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
                    style={{
                      color: colors.menuTxt,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {me?.username}
                  </Text>
                  {!!me?.profile_url && (
                    <Text
                      style={{
                        color: colors.sub,
                        fontSize: 10,
                        fontWeight: "400",
                      }}
                      numberOfLines={1}
                    >
                      {t("menu.profile")}
                    </Text>
                  )}
                </View>
                <IconBtn
                  ripple={rippleItem}
                  overlayColor={overlaySoft}
                  onPress={doLogout}
                  shape="circle"
                  size={36}
                >
                  <Feather name="log-out" size={18} color={colors.accent} />
                </IconBtn>
              </View>
            </CardPressable>
          )
        ) : (
          <CardPressable
            ripple={rippleItem}
            overlayColor={overlaySoft}
            radius={TOKENS.radius + 4}
            onPress={() => setLoginVisible(true)}
            accessibilityLabel={t("menu.login")}
            pressedScale={0.98}
          >
            <View
              style={{
                minHeight: TOKENS.footerH - 16,
                borderRadius: TOKENS.radius + 4,
                backgroundColor: colors.accent + "10",
                paddingVertical: 8,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                justifyContent: "center",
              }}
            >
              <Feather name="log-in" size={TOKENS.icon} color={colors.accent} />
              {!isRail && (
                <Text
                  style={{
                    color: colors.accent,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {t("menu.login")}
                </Text>
              )}
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
  footer: {},
});
