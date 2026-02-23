import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchAutocomplete,
  fetchBlacklistPage,
  submitBlacklist,
  type BlacklistItem,
} from "@/api/online/blacklist";
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";
import { Feather } from "@expo/vector-icons";

const BLACKLIST_TYPES = [
  "tag",
  "artist",
  "parody",
  "character",
  "group",
  "language",
  "category",
] as const;

const TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  tag: "hash",
  artist: "pen-tool",
  parody: "film",
  character: "user",
  group: "users",
  language: "globe",
  category: "folder",
};

function parseBlacklistFromHtml(html: string): Record<string, BlacklistItem[]> {
  const out: Record<string, BlacklistItem[]> = {
    tag: [],
    artist: [],
    parody: [],
    character: [],
    group: [],
    language: [],
    category: [],
  };

  const jsonMatch = html.match(/_blacklist_tags\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\s*\)/);
  const jsonStr = jsonMatch ? jsonMatch[1] : null;

  if (__DEV__) {
    console.log("[BL] regex:", jsonStr ? `OK len=${jsonStr.length}` : "NO MATCH");
  }

  if (jsonStr) {
    try {
      const decoded = jsonStr.replace(
        /\\u([0-9a-fA-F]{4})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16))
      );
      if (__DEV__) console.log("[BL] decoded:", decoded.slice(0, 80));
      const arr = JSON.parse(decoded);
      if (__DEV__) console.log("[BL] parsed arr:", Array.isArray(arr), arr?.length);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const type = String(item.type || "tag").toLowerCase();
          if (BLACKLIST_TYPES.includes(type as any) && item.id && item.name) {
            if (!out[type].some((x) => x.id === item.id)) {
              out[type].push({ id: item.id, name: item.name, type });
            }
          }
        }
        return out;
      }
    } catch (e: any) {
      if (__DEV__) console.warn("[BL] JSON.parse error:", e?.message);
    }
  }

  return out;
}

const Skeleton = ({ style }: { style?: any }) => {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ backgroundColor: "#FFFFFF14", borderRadius: 10 }, style, { opacity }]}
    />
  );
};

export default function ProfileBlacklistScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; slug?: string }>();
  const userId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const slugStr = (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, BlacklistItem[]>>(() => {
    const empty: Record<string, BlacklistItem[]> = {};
    BLACKLIST_TYPES.forEach((t) => (empty[t] = []));
    return empty;
  });
  const [initialItems, setInitialItems] = useState<Record<string, BlacklistItem[]>>(() => {
    const empty: Record<string, BlacklistItem[]> = {};
    BLACKLIST_TYPES.forEach((t) => (empty[t] = []));
    return empty;
  });
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<string>>(new Set());
  const [openAdd, setOpenAdd] = useState<string | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [suggestions, setSuggestions] = useState<BlacklistItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ui = {
    bg: colors.bg,
    card: (colors as any).surfaceElevated ?? "#1a1d22",
    text: (colors as any).title ?? "#e6e7e9",
    sub: (colors as any).metaText ?? "#9ca3af",
    border: "#ffffff10",
    inputBg: "#ffffff08",
    accent: colors.accent ?? "#3b82f6",
    danger: "#ef4444",
    chipBg: "#ffffff0e",
    successBg: (colors.accent ?? "#3b82f6") + "18",
  };

  const loadPage = useCallback(async () => {
    if (!userId || !slugStr) {
      setError("Missing user id or slug");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchBlacklistPage(userId, slugStr);
    setLoading(false);
    if (result.success && result.html) {
      const parsed = parseBlacklistFromHtml(result.html);
      setItems(parsed);
      setInitialItems(parsed);
    } else if (!result.success) {
      setError(result.error || "Failed to load blacklist");
    }
  }, [userId, slugStr]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!openAdd) {
      setSuggestions([]);
      return;
    }
    const q = addQuery.trim();
    if (!q) {
      debounceRef.current = setTimeout(async () => {
        const res = await fetchAutocomplete("", openAdd);
        if (res.success) setSuggestions(res.result);
        else setSuggestions([]);
      }, 100);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetchAutocomplete(q, openAdd);
      if (res.success) setSuggestions(res.result);
      else setSuggestions([]);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [openAdd, addQuery]);

  const addItem = useCallback((type: string, item: BlacklistItem) => {
    setItems((prev) => {
      const list = prev[type] ?? [];
      if (list.some((x) => x.id === item.id)) return prev;
      return { ...prev, [type]: [...list, item] };
    });
    setAddQuery("");
    setSuggestions([]);
    setOpenAdd(null);
  }, []);

  const toggleRemoval = useCallback((type: string, item: BlacklistItem) => {
    const key = `${type}-${item.id}`;
    setMarkedForRemoval((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    if (!userId || !slugStr) return;
    setSaving(true);
    setError(null);
    const added: BlacklistItem[] = [];
    const removed: BlacklistItem[] = [];
    for (const type of BLACKLIST_TYPES) {
      const cur = items[type] ?? [];
      const init = initialItems[type] ?? [];
      const initIds = new Set(init.map((x) => x.id));
      cur.forEach((x) => {
        const key = `${type}-${x.id}`;
        if (markedForRemoval.has(key)) {
          if (initIds.has(x.id)) removed.push(x);
        } else if (!initIds.has(x.id)) {
          added.push(x);
        }
      });
    }
    const result = await submitBlacklist(userId, slugStr, { added, removed });
    setSaving(false);
    if (result.success) {
      const newItems: Record<string, BlacklistItem[]> = {};
      for (const type of BLACKLIST_TYPES) {
        newItems[type] = (items[type] ?? []).filter(
          (x) => !markedForRemoval.has(`${type}-${x.id}`)
        );
      }
      setItems(newItems);
      setInitialItems(newItems);
      setMarkedForRemoval(new Set());
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2500);
    } else {
      setError(result.error || "Failed to save");
    }
  }, [userId, slugStr, items, initialItems, markedForRemoval]);

  const typeLabels: Record<string, string> = {
    tag: t("profile.blacklist.tags"),
    artist: t("profile.blacklist.artists"),
    parody: t("profile.blacklist.parodies"),
    character: t("profile.blacklist.characters"),
    group: t("profile.blacklist.groups"),
    language: t("profile.blacklist.languages"),
    category: t("profile.blacklist.categories"),
  };

  const hasChanges =
    markedForRemoval.size > 0 ||
    BLACKLIST_TYPES.some((type) => {
      const cur = items[type] ?? [];
      const init = initialItems[type] ?? [];
      return cur.length !== init.length || cur.some((x) => !init.some((y) => y.id === x.id));
    });

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ title: t("profile.blacklist.title") }} />
        <View style={s.loadingWrap}>
          <View style={[s.card, { backgroundColor: ui.card }]}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={{ marginBottom: 20 }}>
                <Skeleton style={{ height: 16, width: "40%", marginBottom: 10 }} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Skeleton style={{ height: 32, width: 80, borderRadius: 999 }} />
                  <Skeleton style={{ height: 32, width: 100, borderRadius: 999 }} />
                  <Skeleton style={{ height: 32, width: 64, borderRadius: 999 }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (error && !userId) {
    return (
      <View style={[s.container, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ title: t("profile.blacklist.title") }} />
        <View style={s.centered}>
          <View style={[s.errorCard, { backgroundColor: ui.card }]}>
            <Feather name="alert-circle" size={40} color={ui.danger} />
            <Text style={[s.errorCardTitle, { color: ui.text }]}>{error}</Text>
            <Pressable
              onPress={() => router.back()}
              style={[s.outlineBtn, { borderColor: ui.border }]}
            >
              <Feather name="arrow-left" size={16} color={ui.text} />
              <Text style={[s.outlineBtnText, { color: ui.text }]}>{t("common.back")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ title: t("profile.blacklist.title") }} />

      {/* Banners */}
      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[s.banner, { backgroundColor: ui.danger + "18" }]}>
            <Feather name="alert-triangle" size={15} color={ui.danger} />
            <Text style={[s.bannerText, { color: ui.danger }]}>{error}</Text>
          </View>
        </View>
      ) : null}
      {savedMessage ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[s.banner, { backgroundColor: ui.successBg }]}>
            <Feather name="check-circle" size={15} color={ui.accent} />
            <Text style={[s.bannerText, { color: ui.accent }]}>{t("profile.blacklist.saved")}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {BLACKLIST_TYPES.map((type) => {
          const typeItems = items[type] ?? [];
          const isOpen = openAdd === type;
          const icon = TYPE_ICONS[type] || "hash";

          return (
            <View key={type} style={[s.card, { backgroundColor: ui.card }]}>
              {/* Category header */}
              <View style={s.categoryRow}>
                <View style={[s.categoryIcon, { backgroundColor: ui.chipBg }]}>
                  <Feather name={icon} size={14} color={ui.accent} />
                </View>
                <Text style={[s.categoryLabel, { color: ui.text }]}>{typeLabels[type]}</Text>
                <Text style={[s.categoryCount, { color: ui.sub }]}>{typeItems.length}</Text>
                <Pressable
                  onPress={() => {
                    setOpenAdd(isOpen ? null : type);
                    setAddQuery("");
                    setSuggestions([]);
                  }}
                  style={[s.addBtn, { backgroundColor: isOpen ? ui.accent + "22" : ui.chipBg }]}
                >
                  <Feather
                    name={isOpen ? "x" : "plus"}
                    size={16}
                    color={isOpen ? ui.accent : ui.sub}
                  />
                </Pressable>
              </View>

              {/* Autocomplete */}
              {isOpen && (
                <View style={s.autocompleteWrap}>
                  <View style={[s.searchRow, { backgroundColor: ui.inputBg, borderColor: ui.border }]}>
                    <Feather name="search" size={15} color={ui.sub} />
                    <TextInput
                      value={addQuery}
                      onChangeText={setAddQuery}
                      placeholder={t("profile.blacklist.addPlaceholder")}
                      placeholderTextColor={ui.sub + "aa"}
                      style={[s.searchInput, { color: ui.text }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                  {suggestions.length > 0 && (
                    <ScrollView
                      style={[s.suggestList, { backgroundColor: ui.inputBg, borderColor: ui.border }]}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {suggestions.map((sg, idx) => (
                        <Pressable
                          key={`${sg.type}-${sg.id}`}
                          onPress={() => addItem(type, sg)}
                          style={({ pressed }) => [
                            s.suggestItem,
                            idx < suggestions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.border },
                            pressed && { backgroundColor: ui.accent + "12" },
                          ]}
                        >
                          <Text style={[s.suggestText, { color: ui.text }]} numberOfLines={1}>
                            {sg.name}
                          </Text>
                          <Feather name="plus" size={14} color={ui.accent} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              {/* Chips */}
              {typeItems.length > 0 ? (
                <View style={s.chipRow}>
                  {typeItems.map((item) => {
                    const isMarked = markedForRemoval.has(`${type}-${item.id}`);
                    return (
                      <Pressable
                        key={`${type}-${item.id}`}
                        onPress={() => toggleRemoval(type, item)}
                        style={[
                          s.chip,
                          {
                            backgroundColor: isMarked ? ui.danger + "14" : ui.chipBg,
                            borderColor: isMarked ? ui.danger + "40" : "transparent",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.chipText,
                            {
                              color: isMarked ? ui.sub : ui.text,
                              textDecorationLine: isMarked ? "line-through" : "none",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Feather
                          name={isMarked ? "rotate-ccw" : "x"}
                          size={12}
                          color={isMarked ? ui.accent : ui.sub}
                          style={{ marginLeft: 6 }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={[s.emptyText, { color: ui.sub }]}>
                  {t("profile.blacklist.empty") || "—"}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Sticky save bar */}
      <View
        style={[
          s.bottomBar,
          {
            backgroundColor: ui.bg + "f0",
            paddingBottom: insets.bottom + 12,
            borderTopColor: ui.border,
          },
        ]}
      >
        {hasChanges && (
          <Text style={[s.changeHint, { color: ui.sub }]}>
            {markedForRemoval.size > 0
              ? `${markedForRemoval.size} ${t("profile.blacklist.toRemove") || "to remove"}`
              : t("profile.blacklist.unsaved") || "Unsaved changes"}
          </Text>
        )}
        <Pressable
          onPress={onSave}
          disabled={saving || !hasChanges}
          style={({ pressed }) => [
            s.saveBtn,
            {
              backgroundColor: hasChanges ? ui.accent : ui.chipBg,
              opacity: saving ? 0.7 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color={hasChanges ? "#fff" : ui.sub} />
              <Text style={[s.saveBtnText, { color: hasChanges ? "#fff" : ui.sub }]}>
                {t("profile.blacklist.save")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingWrap: { flex: 1, padding: 16 },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  bannerText: { fontSize: 13, fontWeight: "600", flex: 1 },

  scroll: { flex: 1 },

  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },

  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  categoryIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryLabel: { fontWeight: "700", fontSize: 15, flex: 1, letterSpacing: 0.2 },
  categoryCount: { fontSize: 13, fontWeight: "600", marginRight: 6 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  autocompleteWrap: { marginBottom: 12 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suggestList: {
    maxHeight: 220,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestText: { fontSize: 14, flex: 1, marginRight: 8 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "600", maxWidth: 200 },

  emptyText: { fontSize: 13, fontStyle: "italic" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  changeHint: { flex: 1, fontSize: 12, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    minWidth: 120,
  },
  saveBtnText: { fontWeight: "700", fontSize: 15 },

  errorCard: {
    borderRadius: 18,
    padding: 32,
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 360,
  },
  errorCardTitle: { fontSize: 15, textAlign: "center", fontWeight: "600" },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
  },
  outlineBtnText: { fontWeight: "700", fontSize: 14 },
});
