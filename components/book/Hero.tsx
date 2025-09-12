import type { Book } from "@/api/nhentai";
import { buildImageFallbacks } from "@/components/buildImageFallbacks";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import { timeAgo } from "@/utils/book/timeAgo";
import { Feather, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ring from "./Ring";
import TagBlock, { TagLite } from "./TagBlock";

const READ_HISTORY_KEY = "readHistory";
type ReadHistoryEntry = [number, number, number, number];

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },

  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  readBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
  },
  readTxt: { fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },

  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  dlCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  dlInner: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },

  galleryRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  galleryLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
  layoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  layoutTxt: { fontSize: 12 },
});

export default function Hero({
  book,
  containerW,
  pad,
  wide,
  cols,
  cycleCols,
  liked,
  toggleLike,
  dl,
  pr,
  local,
  handleDownloadOrDelete,
  cancel,
  modeOf,
  onTagPress,
  win,
  innerPadding,
  cycle,
}: {
  book: Book;
  containerW: number;
  pad: number;
  wide: boolean;
  cols: number;
  cycleCols: () => void;
  liked: boolean;
  toggleLike: () => void;
  dl: boolean;
  pr: number;
  local: boolean;
  handleDownloadOrDelete: () => void;
  cancel: () => void;
  modeOf: (t: {
    type: string;
    name: string;
  }) => "include" | "exclude" | undefined;
  onTagPress: (name: string) => void;
  win: { w: number; h: number };
  innerPadding: number;
  cycle: (t: { type: string; name: string }) => void;
}) {
  const { colors } = useTheme();
  const { t, resolvedDateFns } = useI18n();

  const router = useRouter();
  const coverAR =
    book.coverW && book.coverH ? book.coverW / book.coverH : 3 / 4;

  const [readBtn, setReadBtn] = useState<{
    label: string;
    page: number;
    restart: boolean;
  }>({
    label: t("book.read"),
    page: 1,
    restart: false,
  });

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(READ_HISTORY_KEY);
          if (!alive) return;

          let entry: ReadHistoryEntry | undefined;
          if (raw) {
            try {
              const arr = JSON.parse(raw) as any;
              if (Array.isArray(arr))
                entry = arr.find((e: ReadHistoryEntry) => e?.[0] === book.id);
            } catch {}
          }

          if (!entry) {
            setReadBtn({ label: t("book.read"), page: 1, restart: false });
            return;
          }

          const [, current0, total0] = entry;
          const total = Math.max(1, Number(total0) || book.pagesCount || 1);
          const current = Math.min(
            Math.max(0, Number(current0) || 0),
            total - 1
          );
          const done = current >= total - 1;

          if (done)
            setReadBtn({ label: t("book.readAgain"), page: 1, restart: true });
          else
            setReadBtn({
              label: t("book.continuePage", { page: current + 1 }),
              page: current + 1,
              restart: false,
            });
        } catch {
          setReadBtn({ label: t("book.read"), page: 1, restart: false });
        }
      })();
      return () => {
        alive = false;
      };
    }, [book.id, book.pagesCount, t])
  );

  const dedupTags = useMemo(() => {
    const skip = new Set(
      [
        ...(book.artists ?? []),
        ...(book.characters ?? []),
        ...(book.parodies ?? []),
        ...(book.groups ?? []),
        ...(book.categories ?? []),
        ...(book.languages ?? []),
      ].map((t) => t.name)
    );
    return book.tags.filter((t) => !skip.has(t.name));
  }, [book]);

  const DownloadControl = () => {
    if (!dl && !local) {
      return (
        <View style={{ borderRadius: 20, overflow: "hidden" }}>
          <Pressable
            onPress={handleDownloadOrDelete}
            style={[styles.circleBtn, { backgroundColor: colors.tagBg }]}
            android_ripple={{ color: colors.accent + "22", borderless: false }}
            accessibilityRole="button"
            accessibilityLabel={t("book.download")}
          >
            <Feather name="download" size={20} color={colors.accent} />
          </Pressable>
        </View>
      );
    }

    if (!dl && local) {
      return (
        <View style={{ borderRadius: 20, overflow: "hidden" }}>
          <Pressable
            onPress={handleDownloadOrDelete}
            style={[styles.circleBtn, { backgroundColor: colors.tagBg }]}
            android_ripple={{ color: colors.accent + "22", borderless: false }}
            accessibilityRole="button"
            accessibilityLabel={t("book.removeDownload")}
          >
            <Feather name="trash-2" size={20} color={colors.accent} />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={{ borderRadius: 20, overflow: "hidden" }}>
        <Pressable
          onPress={cancel}
          style={[styles.dlCircle, { backgroundColor: colors.tagBg }]}
          android_ripple={{ color: colors.accent + "22", borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={t("book.cancelDownload")}
        >
          <Ring progress={pr} size={28} />
          <View style={styles.dlInner}>
            <Feather name="x" size={14} color={colors.accent} />
          </View>
        </Pressable>
      </View>
    );
  };

  if (wide) {
    return (
      <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
        <View
          style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}
        >
          <View style={{ width: Math.min(360, win.w * 0.35) }}>
            <View
              style={{
                width: "100%",
                aspectRatio: coverAR,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: colors.page,
              }}
            >
              <ExpoImage
                source={buildImageFallbacks(book.cover)}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="disk"
              />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Pressable
              onLongPress={() => Clipboard.setStringAsync(book.title.pretty)}
            >
              <Text
                style={{
                  color: colors.txt,
                  fontSize: 22,
                  fontWeight: "800",
                  marginBottom: 4,
                }}
              >
                {book.title.pretty}
              </Text>
            </Pressable>

            <Pressable
              onLongPress={() => Clipboard.setStringAsync(book.title.english)}
            >
              <Text style={{ color: colors.metaText, fontSize: 14 }}>
                {book.title.english}
              </Text>
            </Pressable>

            {book.title.japanese !== book.title.english && (
              <Pressable
                onLongPress={() =>
                  Clipboard.setStringAsync(book.title.japanese)
                }
              >
                <Text
                  style={{
                    color: colors.metaText,
                    fontSize: 13,
                    fontStyle: "italic",
                  }}
                >
                  {book.title.japanese}
                </Text>
              </Pressable>
            )}

            {!!book.scanlator && (
              <Text
                style={{ color: colors.metaText, fontSize: 12, marginTop: 4 }}
              >
                Scanlated by {book.scanlator}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Feather name="hash" size={14} color={colors.metaText} />
              <Pressable
                onLongPress={() => Clipboard.setStringAsync(String(book.id))}
              >
                <Text style={{ fontSize: 13, color: colors.metaText }}>
                  {book.id}
                </Text>
              </Pressable>

              <Feather
                name="calendar"
                size={14}
                color={colors.metaText}
                style={{ marginLeft: 12 }}
              />
              <Text style={{ fontSize: 13, color: colors.metaText }}>
                {timeAgo(book.uploaded, resolvedDateFns)}
              </Text>

              <Feather
                name="heart"
                size={14}
                color={colors.metaText}
                style={{ marginLeft: 12 }}
              />
              <Text style={{ fontSize: 13, color: colors.metaText }}>
                {book.favorites}
              </Text>

              <Feather
                name="book-open"
                size={14}
                color={colors.metaText}
                style={{ marginLeft: 12 }}
              />
              <Text style={{ fontSize: 13, color: colors.metaText }}>
                {book.pagesCount}
              </Text>
            </View>

            <View style={[styles.actionRow, { marginTop: 14 }]}>
              <View style={{ borderRadius: 14, overflow: "hidden", flex: 1 }}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/read",
                      params: {
                        id: String(book.id),
                        page: String(readBtn.page),
                      },
                    })
                  }
                  style={[styles.readBtn, { backgroundColor: colors.accent }]}
                  android_ripple={{ color: "#ffffff22", borderless: false }}
                >
                  <Feather
                    name={readBtn.restart ? "rotate-ccw" : "book-open"}
                    size={18}
                    color={colors.bg}
                  />
                  <Text style={[styles.readTxt, { color: colors.bg }]}>
                    {readBtn.label}
                  </Text>
                </Pressable>
              </View>

              <DownloadControl />

              <View style={{ borderRadius: 20, overflow: "hidden" }}>
                <Pressable
                  onPress={toggleLike}
                  style={[styles.circleBtn, { backgroundColor: colors.tagBg }]}
                  android_ripple={{
                    color: colors.accent + "22",
                    borderless: false,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    liked ? "Убрать из избранного" : "Добавить в избранное"
                  }
                >
                  <FontAwesome
                    name={liked ? "heart" : "heart-o"}
                    size={20}
                    color={liked ? "#FF5A5F" : colors.accent}
                  />
                </Pressable>
              </View>
            </View>

            <TagBlock
              label={t("tags.artists")}
              tags={book.artists as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.characters")}
              tags={book.characters as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.parodies")}
              tags={book.parodies as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.groups")}
              tags={book.groups as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.categories")}
              tags={book.categories as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.languages")}
              tags={book.languages as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />
            <TagBlock
              label={t("tags.tags")}
              tags={dedupTags as TagLite[]}
              modeOf={modeOf}
              cycle={cycle}
              onTagPress={onTagPress}
            />

            <View style={[styles.galleryRow, { marginTop: 16 }]}>
              <Text style={[styles.galleryLabel, { color: colors.metaText }]}>
                {t("book.gallery")}
              </Text>
              <Pressable onPress={cycleCols} style={styles.layoutBtn}>
                <Feather name="layout" size={18} color={colors.metaText} />
                <Text style={[styles.layoutTxt, { color: colors.metaText }]}>
                  {cols}×
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const contentW = containerW - pad * 2;
  const cardW = contentW * 0.78;

  return (
    <View style={{ paddingHorizontal: pad, position: "relative" }}>
      <View
        style={{
          width: containerW,
          alignSelf: "center",
          aspectRatio: coverAR,
          overflow: "hidden",
        }}
      >
        <ExpoImage
          source={buildImageFallbacks(book.cover)}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="disk"
        />
        <LinearGradient
          colors={[`${colors.bg}ff`, `${colors.bg}b8`, `${colors.bg}ff`]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View
        style={{
          position: "absolute",
          left: (contentW - cardW) / 2,
          top: contentW * 0.1,
          width: cardW,
          height: cardW * 1.35,
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: colors.page,
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <ExpoImage
          source={buildImageFallbacks(book.cover)}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>

      <View
        style={{
          paddingHorizontal: 0,
          marginTop:
            cardW * 1.35 + contentW * 0.1 + 12 - contentW / (coverAR || 0.75),
        }}
      >
        <Pressable
          onLongPress={() => Clipboard.setStringAsync(book.title.pretty)}
        >
          <Text
            style={{
              color: colors.txt,
              fontSize: 20,
              fontWeight: "800",
              marginBottom: 4,
            }}
          >
            {book.title.pretty}
          </Text>
        </Pressable>
        <Pressable
          onLongPress={() => Clipboard.setStringAsync(book.title.english)}
        >
          <Text style={{ color: colors.metaText, fontSize: 14 }}>
            {book.title.english}
          </Text>
        </Pressable>
        {book.title.japanese !== book.title.english && (
          <Pressable
            onLongPress={() => Clipboard.setStringAsync(book.title.japanese)}
          >
            <Text
              style={{
                color: colors.metaText,
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              {book.title.japanese}
            </Text>
          </Pressable>
        )}

        {!!book.scanlator && (
          <Text style={{ color: colors.metaText, fontSize: 12, marginTop: 4 }}>
            Scanlated by {book.scanlator}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Feather name="hash" size={14} color={colors.metaText} />
          <Pressable
            onLongPress={() => Clipboard.setStringAsync(String(book.id))}
          >
            <Text style={{ fontSize: 13, color: colors.metaText }}>
              {book.id}
            </Text>
          </Pressable>

          <Feather
            name="calendar"
            size={14}
            color={colors.metaText}
            style={{ marginLeft: 12 }}
          />
          <Text style={{ fontSize: 13, color: colors.metaText }}>
            {timeAgo(book.uploaded, resolvedDateFns)}
          </Text>

          <Feather
            name="heart"
            size={14}
            color={colors.metaText}
            style={{ marginLeft: 12 }}
          />
          <Text style={{ fontSize: 13, color: colors.metaText }}>
            {book.favorites}
          </Text>

          <Feather
            name="book-open"
            size={14}
            color={colors.metaText}
            style={{ marginLeft: 12 }}
          />
          <Text style={{ fontSize: 13, color: colors.metaText }}>
            {book.pagesCount}
          </Text>
        </View>

        <View style={[styles.actionRow, { marginTop: 14 }]}>
          <View style={{ borderRadius: 14, overflow: "hidden", flex: 1 }}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/read",
                  params: { id: String(book.id), page: String(readBtn.page) },
                })
              }
              style={[styles.readBtn, { backgroundColor: colors.accent }]}
              android_ripple={{ color: "#ffffff22", borderless: false }}
            >
              <Feather
                name={readBtn.restart ? "rotate-ccw" : "book-open"}
                size={18}
                color={colors.bg}
              />
              <Text style={[styles.readTxt, { color: colors.bg }]}>
                {readBtn.label}
              </Text>
            </Pressable>
          </View>

          <DownloadControl />

          <View style={{ borderRadius: 20, overflow: "hidden" }}>
            <Pressable
              onPress={toggleLike}
              style={[styles.circleBtn, { backgroundColor: colors.tagBg }]}
              android_ripple={{
                color: colors.accent + "22",
                borderless: false,
              }}
              accessibilityRole="button"
              accessibilityLabel={
                liked ? "Убрать из избранного" : "Добавить в избранное"
              }
            >
              <FontAwesome
                name={liked ? "heart" : "heart-o"}
                size={20}
                color={liked ? "#FF5A5F" : colors.accent}
              />
            </Pressable>
          </View>
        </View>

        <TagBlock
          label={t("tags.artists")}
          tags={book.artists as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.characters")}
          tags={book.characters as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.parodies")}
          tags={book.parodies as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.groups")}
          tags={book.groups as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.categories")}
          tags={book.categories as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.languages")}
          tags={book.languages as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />
        <TagBlock
          label={t("tags.tags")}
          tags={dedupTags as TagLite[]}
          modeOf={modeOf}
          cycle={cycle}
          onTagPress={onTagPress}
        />

        <View style={[styles.galleryRow, { marginTop: 16 }]}>
          <Text style={[styles.galleryLabel, { color: colors.metaText }]}>
            {t("gallery")}
          </Text>
          <Pressable onPress={cycleCols} style={styles.layoutBtn}>
            <Feather name="layout" size={18} color={colors.metaText} />
            <Text style={[styles.layoutTxt, { color: colors.metaText }]}>
              {cols}×
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
