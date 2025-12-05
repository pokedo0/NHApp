import { Feather } from "@expo/vector-icons";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import DateRangePicker from "@/components/DateRangePicker";
import { useDrawer } from "@/components/DrawerContext";
import NhModal from "@/components/nhModal";
import { useDateRange } from "@/context/DateRangeContext";
import { SortKey, useSort } from "@/context/SortContext";
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";

const BAR_HEIGHT = 52;
const BTN_SIDE = 40;

function hasSeg(pathname: string | null | undefined, seg: string) {
  const p = pathname ?? "";
  return new RegExp(`(^|/)${seg}(\\/|$)`).test(p);
}

function IconBtn({
  onPress,
  onLongPress,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.iconBtnRound,
        pressed && { backgroundColor: colors.accent + "22" },
      ]}
    >
      {children}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.searchTxt,
        opacity: 0.8,
        marginTop: 8,
        marginBottom: 6,
        fontWeight: "800",
        letterSpacing: 0.3,
      }}
    >
      {children}
    </Text>
  );
}

function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.page,
          borderColor: selected ? colors.accent : colors.page,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.chipInner}>
        {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
        <Text
          style={{
            color: selected ? colors.bg : colors.searchTxt,
            fontWeight: selected ? "800" : "600",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function SearchBar() {
  const { colors } = useTheme();
  const { openDrawer } = useDrawer();
  const { sort, setSort } = useSort();
  const router = useRouter();
  const pathname = usePathname();
  const { from, to, setRange, clearRange } = useDateRange();
  const { t } = useI18n();

  const PRESETS: {
    key: SortKey;
    label: string;
    icon?: keyof typeof Feather.glyphMap;
  }[] = [
    { key: "date", label: t("explore.sort.latest") || "Новое", icon: "clock" },
    {
      key: "popular-today",
      label: t("explore.sort.popularToday") || "Сегодня",
      icon: "sun",
    },
    {
      key: "popular-week",
      label: t("explore.sort.popularWeek") || "Неделя",
      icon: "calendar",
    },
    {
      key: "popular-month",
      label: t("explore.sort.popularMonth") || "Месяц",
      icon: "calendar",
    },
    {
      key: "popular",
      label: t("explore.sort.popular") || "Горячее",
      icon: "trending-up",
    },
  ];

  const params = useGlobalSearchParams<{
    query?: string | string[];
    id?: string | string[];
    title?: string | string[];
    slug?: string | string[];
  }>();
  const q = typeof params.query === "string" ? params.query : "";
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const bookId = typeof rawId === "string" ? rawId : undefined;
  const rawTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const bookTitle = typeof rawTitle === "string" ? rawTitle : undefined;
  const rawSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const userName =
    typeof rawSlug === "string" ? decodeURIComponent(rawSlug) : undefined;

  function getTitle(
    pathname: string | null | undefined,
    q: string,
    bookTitle?: string,
    bookId?: string
  ) {
    const p = pathname ?? "";
    const has = (seg: string) => new RegExp(`(^|/)${seg}(\\/|$)`).test(p);
    if (p === "/" || has("index")) return t("menu.home");
    if (has("explore"))
      return q ? t("search.results") + ": " + q : t("menu.explore");
    if (has("favorites")) return t("menu.favorites");
    if (has("favoritesOnline")) return t("menu.favoritesOnline");
    if (has("downloaded")) return t("menu.downloaded");
    if (has("recommendations")) return t("menu.recommendations");
    if (has("history")) return t("menu.history");
    if (has("characters")) return t("menu.characters");
    if (has("settings")) return t("menu.settings");
    if (has("book")) return `#${bookId} - ${bookTitle}`;
    if (has("search"))
      return q ? t("menu.search") + ": " + q : t("menu.search");
    if (has("tags")) return t("menu.tags");
    if (has("profile")) return `${t("menu.profile")}: ${userName}`;
    return "NH App";
  }

  const [sortOpen, setSortOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);

  const title = useMemo(
    () => getTitle(pathname, q, bookTitle, bookId),
    [pathname, q, bookTitle, bookId]
  );
  const showBack = pathname && pathname !== "/" && pathname !== "/index";

  const hideRight =
    hasSeg(pathname, "settings") ||
    hasSeg(pathname, "tags") ||
    hasSeg(pathname, "book") ||
    hasSeg(pathname, "profile") ||
    hasSeg(pathname, "characters") ||
    hasSeg(pathname, "favorites") ||
    hasSeg(pathname, "favoritesOnline");

  const closeSort = () => setSortOpen(false);
  const openSort = () => setSortOpen(true);

  const backOne = () => {
    setBackOpen(false);
    router.back();
  };
  const backTwo = () => {
    setBackOpen(false);
    router.back();
    setTimeout(() => router.back(), 0);
  };
  const backHome = () => {
    setBackOpen(false);
    router.replace("/");
  };

  const fmt = (d?: any) => (d ? new Date(d).toLocaleDateString() : "—");
  const rangeLabel = useMemo(() => `${fmt(from)}  •  ${fmt(to)}`, [from, to]);
  const hasDateFilter = !!from || !!to;

  useEffect(() => {
    if (hasDateFilter && sort !== "date") {
      setSort("date");
    }
  }, [hasDateFilter]);

  return (
    <View>
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: colors.searchBg,
            height: BAR_HEIGHT,
            borderBottomColor: colors.page,
          },
        ]}
      >
        {showBack ? (
          <IconBtn
            onPress={() => router.back()}
            onLongPress={() => setBackOpen(true)}
          >
            <Feather name="arrow-left" size={20} color={colors.searchTxt} />
          </IconBtn>
        ) : (
          <IconBtn onPress={openDrawer}>
            <Feather name="menu" size={22} color={colors.searchTxt} />
          </IconBtn>
        )}

        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.searchTxt }]}
        >
          {title}
        </Text>

        {!hideRight && (
          <View style={styles.rightGroup}>
            <IconBtn
              onPress={() =>
                router.push({
                  pathname: "/search",
                  params: q ? { query: q } : {},
                })
              }
            >
              <Feather name="search" size={18} color={colors.searchTxt} />
            </IconBtn>

            <IconBtn onPress={openSort}>
              <Feather name="filter" size={18} color={colors.accent} />
            </IconBtn>

            <IconBtn onPress={() => router.push("/tags")}>
              <Feather name="tag" size={18} color={colors.accent} />
            </IconBtn>
          </View>
        )}
      </Animated.View>

      <NhModal
        visible={sortOpen}
        onClose={closeSort}
        dimBackground
        sheetStyle={{
          backgroundColor: colors.searchBg,
          borderColor: colors.page,
        }}
        title={t("explore.sortBy") || "Сортировка и дата"}
        hint={
          hasDateFilter
            ? t("explore.dateRange")
            : t("common.chooseOption") || "Выберите вариант"
        }
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {!hasDateFilter && (
            <View>
              <SectionTitle>
                {t("explore.quickPeriod")}
              </SectionTitle>
              <View style={styles.chipsWrap}>
                {PRESETS.map(({ key, label, icon }) => (
                  <Chip
                    key={key}
                    label={label}
                    selected={sort === key}
                    onPress={() => {
                      if (from || to) clearRange();
                      setSort(key);
                      closeSort();
                    }}
                    icon={
                      icon ? (
                        <Feather
                          name={icon as any}
                          size={14}
                          color={sort === key ? colors.bg : colors.searchTxt}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 4 }}>
            <SectionTitle>
              {(t("explore.dateRange")) +
                (hasDateFilter ? ` — ${rangeLabel}` : "")}
            </SectionTitle>

            <View style={styles.row}>
              <Pressable
                style={[
                  styles.rowBtn,
                  styles.rounded,
                  { backgroundColor: colors.page },
                ]}
                onPress={() => setDateModalOpen(true)}
              >
                <View style={styles.rowBtnInner}>
                  <Feather name="calendar" size={16} color={colors.accent} />
                  <Text style={[styles.rowBtnTxt, { color: colors.searchTxt }]}>
                    {hasDateFilter
                      ? rangeLabel
                      : t("common.select")}
                  </Text>
                </View>
              </Pressable>

              {hasDateFilter && (
                <Pressable
                  style={[
                    styles.rowBtn,
                    styles.rounded,
                    { backgroundColor: colors.page },
                  ]}
                  onPress={() => {
                    clearRange();
                  }}
                >
                  <View style={styles.rowBtnInner}>
                    <Feather name="x-circle" size={16} color={colors.accent} />
                    <Text
                      style={[
                        styles.rowBtnTxt,
                        { color: colors.accent, fontWeight: "800" },
                      ]}
                    >
                      {t("common.reset")}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.sheetFooterHint}>
          <Text style={{ color: colors.searchTxt, opacity: 0.6, fontSize: 12 }}>
            {hasDateFilter
              ? t("explore.hintDatesActive")
              : t("explore.hintPresets")}
          </Text>
        </View>
      </NhModal>

      <NhModal
        visible={backOpen}
        onClose={() => setBackOpen(false)}
        sheetStyle={{
          backgroundColor: colors.searchBg,
          borderColor: colors.page,
        }}
        title={t("common.back")}
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={[styles.sortRow, styles.rounded]} onPress={backOne}>
            <Text style={[styles.sortTxt, { color: colors.searchTxt }]}>
              {t("searchBar.backOne")}
            </Text>
          </Pressable>
          <Pressable style={[styles.sortRow, styles.rounded]} onPress={backTwo}>
            <Text style={[styles.sortTxt, { color: colors.searchTxt }]}>
              {t("searchBar.backTwo")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortRow, styles.rounded]}
            onPress={backHome}
          >
            <Text style={[styles.sortTxt, { color: colors.searchTxt }]}>
              {t("searchBar.backHome")}
            </Text>
          </Pressable>
        </ScrollView>
      </NhModal>

      <NhModal
        visible={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        sheetStyle={{
          backgroundColor: colors.searchBg,
          borderColor: colors.page,
        }}
        title={t("explore.datePickerTitle")}
      >
        <DateRangePicker
          initialFrom={from ? new Date(from as any) : null}
          initialTo={to ? new Date(to as any) : null}
          onClear={() => {
            clearRange();
            setDateModalOpen(false);
          }}
          onApply={({ from: f, to: t }) => {
            setRange(f ?? null, t ?? null);
            setSort("date");
            setDateModalOpen(false);
          }}
        />
      </NhModal>
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: { borderRadius: 12, overflow: "hidden" },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    elevation: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  title: {
    marginLeft: 8,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlignVertical: "center",
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 6,
  },
  iconBtnRound: {
    width: BTN_SIDE,
    height: BTN_SIDE,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  sheetScroll: {},
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  sortTxt: { fontSize: 15 },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 100,
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  rowBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowBtnTxt: { fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

  sheetFooterHint: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
});

export default SearchBar;
