import React, { useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Book } from "@/api/nhentai";
import SmartImageWithRetry from "@/components/SmartImageWithRetry";
import { buildImageFallbacks } from "@/components/buildImageFallbacks";
import NhModal from "@/components/nhModal";
import { useTheme } from "@/lib/ThemeContext";
import { makeCardStyles } from "../BookCard.styles";

const CN_FLAG = require("@/assets/images/flags/CN.png");
const GB_FLAG = require("@/assets/images/flags/GB.png");
const JP_FLAG = require("@/assets/images/flags/JP.png");
const FLAG_MAP: Record<string, any> = {
  chinese: CN_FLAG,
  english: GB_FLAG,
  japanese: JP_FLAG,
};

const LANG_TAG_JP = 6346;
const LANG_TAG_CN = 29963;
const LANG_TAG_EN = 12227;

function languageKeyFromTagIdList(ids: number[] | undefined): string | undefined {
  if (!ids?.length) return undefined;
  for (const id of ids) {
    if (id === LANG_TAG_JP) return "japanese";
    if (id === LANG_TAG_CN) return "chinese";
    if (id === LANG_TAG_EN) return "english";
  }
  return undefined;
}

function inferLanguageKeyFromBook(book: Book): string | undefined {
  const fromList = languageKeyFromTagIdList(book.tagIds);
  if (fromList) return fromList;
  return languageKeyFromTagIdList(book.tags?.map((t) => t.id));
}

export interface BookCardClassicProps {
  book: Book;
  cardWidth?: number;
  contentScale?: number;
  isFavorite?: boolean;
  onPress?: (id: number) => void;
  background?: string;
  score?: number;
  onTagPress?: (name: string) => void;
}

export default function BookCardClassic({
  book,
  cardWidth = 160,
  contentScale = 1,
  onPress,
  background,
  score,
  onTagPress,
}: BookCardClassicProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () => makeCardStyles(colors, cardWidth, contentScale),
    [colors, cardWidth, contentScale]
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const fullTitle = book.title?.pretty ?? "";

  const langName = (() => {
    const arr = book.languages || [];
    if (arr?.length) {
      const p = arr[0]?.name?.toLowerCase();
      const s = arr[1]?.name?.toLowerCase();
      return p === "translated" && s ? s : p;
    }
    return inferLanguageKeyFromBook(book);
  })();
  const flagSrc = langName ? FLAG_MAP[langName] : undefined;

  const sources = buildImageFallbacks(book.cover);

  const handlePressCard = () => onPress?.(book.id);
  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const year = (() => {
    const d = book.uploaded ? new Date(book.uploaded) : null;
    const y = d && Number.isFinite(d.getTime()) ? d.getFullYear() : undefined;
    return y && y > 1970 ? y : undefined;
  })();
  const pages = book.pagesCount || book.pages?.length || undefined;
  const scoreClamped =
    typeof score === "number" && Number.isFinite(score)
      ? Math.max(0, Math.min(5, score))
      : undefined;

  const langShort = (langName ? langName.slice(0, 2) : "").toUpperCase();

  // Collect all semantic tag-like names: tags + parodies + characters + artists + groups + categories
  // (languages are shown as flag badge — skip them here)
  const namedTags = useMemo(() => {
    const pick = (arr?: { name?: string }[]) =>
      arr?.map((x) => x.name).filter(Boolean) as string[] ?? [];
    const all = [
      ...pick(book.tags),
      ...pick(book.parodies),
      ...pick(book.characters),
      ...pick(book.artists),
      ...pick(book.groups),
      ...pick(book.categories),
    ];
    // deduplicate
    return [...new Set(all)];
  }, [book.tags, book.parodies, book.characters, book.artists, book.groups, book.categories]);

  // Full list for modal: namedTags first, then #id fallback if everything is empty
  const tagNames = useMemo(() => {
    if (namedTags.length) return namedTags;
    const ids = (book.tagIds ?? []).filter((n) => Number.isFinite(n) && n > 0);
    return ids.map((id) => `#${id}`);
  }, [namedTags, book.tagIds]);

  const visibleTags = useMemo(() => namedTags.slice(0, 3), [namedTags]);
  const moreTags = Math.max(0, namedTags.length - visibleTags.length);

  const hasMetaRow =
    !!langShort || (typeof pages === "number" && pages > 0) || !!year || scoreClamped != null;

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          localStyles.card,
          background ? { backgroundColor: background } : undefined,
          hovered && Platform.OS === "web" ? localStyles.cardHover : null,
          pressed ? localStyles.cardPressed : null,
          { width: cardWidth },
        ]}
        onPress={handlePressCard}
        onLongPress={openMenu}
        delayLongPress={350}
        onHoverIn={Platform.OS === "web" ? () => setHovered(true) : undefined}
        onHoverOut={Platform.OS === "web" ? () => setHovered(false) : undefined}
        {...(Platform.OS === "web"
          ? ({
              onContextMenu: (e: any) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                openMenu();
              },
            } as any)
          : {})}
      >
        {/* ── Cover ── */}
        <View style={[styles.imageWrap, localStyles.imageWrap]}>
          <SmartImageWithRetry
            sources={sources}
            style={styles.cover}
            maxRetries={3}
            retryDelay={1000}
          />
          {flagSrc && (
            <View style={styles.langBadge} pointerEvents="none">
              <Image source={flagSrc} style={styles.langImg} resizeMode="cover" />
            </View>
          )}
        </View>

        {/* ── Info block (below image, no overlay) ── */}
        <View style={localStyles.infoBlock}>
          {!!fullTitle && (
            <Text style={localStyles.title} numberOfLines={2} ellipsizeMode="tail">
              {fullTitle}
            </Text>
          )}

          {hasMetaRow && (
            <View style={localStyles.metaRow}>
              {!!langShort && <Text style={localStyles.metaText}>{langShort}</Text>}
              {!!langShort && typeof pages === "number" && pages > 0 && (
                <View style={localStyles.dot} />
              )}
              {typeof pages === "number" && pages > 0 && (
                <Text style={localStyles.metaText}>{pages} стр.</Text>
              )}
              {(!!langShort || (typeof pages === "number" && pages > 0)) && !!year && (
                <View style={localStyles.dot} />
              )}
              {!!year && <Text style={localStyles.metaText}>{year}</Text>}
              {scoreClamped != null && (
                <>
                  <View style={localStyles.dot} />
                  <Text style={[localStyles.metaText, localStyles.score]}>
                    ★ {scoreClamped.toFixed(1)}
                  </Text>
                </>
              )}
            </View>
          )}

          {(visibleTags.length > 0 || moreTags > 0) && (
            <View style={localStyles.tagsRow}>
              {visibleTags.map((t) => (
                <View key={t} style={localStyles.tagChip}>
                  <Text style={localStyles.tagText} numberOfLines={1}>
                    {t}
                  </Text>
                </View>
              ))}
              {moreTags > 0 && (
                <View style={[localStyles.tagChip, localStyles.tagChipMore]}>
                  <Text style={localStyles.tagTextMore}>+{moreTags}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>

      {/* ── Context menu: all tags ── */}
      <NhModal
        visible={menuOpen}
        onClose={closeMenu}
        title={fullTitle || `#${book.id}`}
        sheetStyle={{ backgroundColor: colors.page, borderColor: colors.page }}
        sizing="wrap"
      >
        <ScrollView
          style={{ maxHeight: 420 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 18 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{ color: colors.metaText, fontWeight: "800", fontSize: 12, marginBottom: 10 }}
          >
            Теги
          </Text>
          <View style={localStyles.tagsWrap}>
            {tagNames.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  closeMenu();
                  onTagPress?.(t);
                }}
                style={({ pressed }) => [
                  localStyles.tagPill,
                  { backgroundColor: colors.tagBg, borderColor: colors.page },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                android_ripple={{ color: colors.accent + "22", borderless: false }}
              >
                <Text
                  style={{ color: colors.tagText, fontWeight: "700", fontSize: 12 }}
                  numberOfLines={1}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </NhModal>
    </>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    overflow: "visible",
  },
  cardHover: {
    transform: [{ translateY: -2 }],
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  imageWrap: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  infoBlock: {
    paddingTop: 8,
    paddingHorizontal: 4,
    paddingBottom: 4,
    gap: 5,
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  metaText: {
    color: "rgba(255,255,255,0.50)",
    fontWeight: "600",
    fontSize: 11,
    lineHeight: 13,
  },
  score: {
    color: "#FFD166",
  },
  dot: {
    width: 2,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  tagChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    maxWidth: "100%",
  },
  tagChipMore: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  tagText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "600",
    maxWidth: 120,
  },
  tagTextMore: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
});
