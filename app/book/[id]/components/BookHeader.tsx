import {
  createCharacterCard,
  getCharactersWithCards,
  getGlobalCharacterCardForCharacter,
  Rect,
} from "@/api/nhappApi/characterCards";
import type { Book } from "@/api/nhappApi/types";
import { buildImageFallbacks } from "@/components/buildImageFallbacks";
import { CharacterCropModal } from "@/components/CharacterCropModal";
import { CharacterSelectModal } from "@/components/CharacterSelectModal";
import ExpoImage from "@/components/ExpoImageCompat";
import Ring from "@/components/book/Ring";
import TagBlock, { TagLite } from "@/components/book/TagBlock";
import { useOnlineMe } from "@/hooks/useOnlineMe";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import { timeAgo } from "@/utils/book/timeAgo";
import { Feather, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { isElectron, openReaderWindow } from "@/electron/bridge";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const READ_HISTORY_KEY = "readHistory";
type ReadHistoryEntry = [number, number, number, number];
type CharacterTag = TagLite & { hasCard?: boolean };

function normalizeNhentaiImageUrl(url: string): string {
  return url.replace(/\/(\d+)w\.(jpg|jpeg|png|gif)$/i, "/$1.$2");
}

// ─── Page Picker Modal ───────────────────────────────────────────────────────

const PagePickerModal: React.FC<{
  visible: boolean;
  pagesCount: number;
  getPageImageUri: (i: number) => string;
  onClose: () => void;
  onSelect: (i: number, uri: string) => void;
}> = ({ visible, pagesCount, getPageImageUri, onClose, onSelect }) => {
  const pages = Array.from({ length: Math.max(1, pagesCount) }, (_, i) => i + 1);
  if (!visible) return null;
  return (
    <Modal visible statusBarTranslucent animationType="fade" transparent onRequestClose={onClose}>
      <View style={ps.backdrop}>
        <View style={ps.modal}>
          <Text style={ps.title}>Select a page to edit</Text>
          <FlatList
            horizontal
            data={pages}
            keyExtractor={(item) => String(item)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => {
              const uri = getPageImageUri(item);
              return (
                <Pressable onPress={() => onSelect(item, uri)} style={ps.pageItem}>
                  <ExpoImage source={{ uri }} style={ps.pageImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  <View style={ps.pageLabel}>
                    <Text style={ps.pageLabelText}>{item}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
          <Pressable style={ps.closeBtn} onPress={onClose}>
            <Text style={ps.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const ps = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  modal: { width: "90%", borderRadius: 20, padding: 16, backgroundColor: "#111" },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 10 },
  pageItem: { width: 90, height: 130, borderRadius: 12, marginHorizontal: 4, overflow: "hidden", backgroundColor: "#222" },
  pageImage: { width: "100%", height: "100%" },
  pageLabel: { position: "absolute", bottom: 0, left: 0, right: 0, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center" },
  pageLabelText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  closeBtn: { marginTop: 10, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#333" },
  closeText: { color: "#fff", fontSize: 13, fontWeight: "500" },
});

// ─── BookHeader ──────────────────────────────────────────────────────────────

export default function BookHeader({
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
  commentCount,
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
  modeOf: (t: { type: string; name: string }) => "include" | "exclude" | undefined;
  onTagPress: (name: string) => void;
  win: { w: number; h: number };
  innerPadding: number;
  cycle: (t: { type: string; name: string }) => void;
  commentCount: number;
}) {
  const { colors } = useTheme();
  const { t, resolvedDateFns } = useI18n();
  const router = useRouter();
  const me = useOnlineMe();
  const meId = me?.id ?? null;
  const coverAR = book.coverW && book.coverH ? book.coverW / book.coverH : 3 / 4;

  // ── Read history ──────────────────────────────────────────────────────────

  const [readBtn, setReadBtn] = useState<{ label: string; page: number; restart: boolean }>({
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
          if (!entry) { setReadBtn({ label: t("book.read"), page: 1, restart: false }); return; }
          const [, current0, total0] = entry;
          const total = Math.max(1, Number(total0) || book.pagesCount || 1);
          const current = Math.min(Math.max(0, Number(current0) || 0), total - 1);
          const done = current >= total - 1;
          if (done)
            setReadBtn({ label: t("book.readAgain"), page: 1, restart: true });
          else
            setReadBtn({ label: t("book.continuePage", { page: current + 1 }), page: current + 1, restart: false });
        } catch {
          setReadBtn({ label: t("book.read"), page: 1, restart: false });
        }
      })();
      return () => { alive = false; };
    }, [book.id, book.pagesCount, t])
  );

  const handleReadPress = useCallback(async () => {
    if (!book.id) return;
    if (isElectron()) {
      const ok = await openReaderWindow(book.id, readBtn.page);
      if (!ok) router.push({ pathname: "/read", params: { id: String(book.id), page: String(readBtn.page) } });
    } else {
      router.push({ pathname: "/read", params: { id: String(book.id), page: String(readBtn.page) } });
    }
  }, [book.id, readBtn.page, router]);

  const openComments = useCallback(() => {
    router.push({ pathname: "/book/[id]/comments", params: { id: String(book.id) } });
  }, [book.id, router]);

  // ── Tags ──────────────────────────────────────────────────────────────────

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

  // ── Character cards ───────────────────────────────────────────────────────

  const [charactersWithCards, setCharactersWithCards] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const names = await getCharactersWithCards(book.id);
        if (!cancelled) setCharactersWithCards(names);
      } catch {
        if (!cancelled) setCharactersWithCards([]);
      }
    })();
    return () => { cancelled = true; };
  }, [book.id, refreshKey]);

  const [characterCardsMap, setCharacterCardsMap] = useState<
    Record<string, { imageUrl: string; parodyName: string | null; rect: Rect }>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!book.characters?.length || !charactersWithCards.length) {
        if (!cancelled) setCharacterCardsMap({});
        return;
      }
      const names = book.characters.map((c) => c.name).filter((n) => charactersWithCards.includes(n));
      if (!names.length) { if (!cancelled) setCharacterCardsMap({}); return; }
      const current = { ...characterCardsMap };
      const toLoad = names.filter((n) => !current[n]);
      if (!toLoad.length) return;
      await Promise.all(
        toLoad.map(async (name) => {
          try {
            const card = await getGlobalCharacterCardForCharacter(name);
            if (!card) return;
            current[name] = { imageUrl: card.imageUrl, parodyName: card.parodyName ?? null, rect: card.rect };
          } catch {}
        })
      );
      if (!cancelled) setCharacterCardsMap(current);
    })();
    return () => { cancelled = true; };
  }, [book.characters, charactersWithCards, refreshKey]);

  const characterTagsWithInfo = useMemo<CharacterTag[]>(() => {
    if (!book.characters?.length) return [];
    const withCard: CharacterTag[] = [];
    const withoutCard: CharacterTag[] = [];
    (book.characters as CharacterTag[]).forEach((tag) => {
      const base: CharacterTag = { ...tag };
      const hasCard = charactersWithCards.includes(tag.name);
      const cardInfo = characterCardsMap[tag.name];
      if (hasCard && cardInfo) {
        Object.assign(base, { hasCard: true, cardImageUrl: cardInfo.imageUrl, cardParodyName: cardInfo.parodyName, cardRect: cardInfo.rect });
        withCard.push(base);
      } else {
        if (hasCard) base.hasCard = true;
        withoutCard.push(base);
      }
    });
    return [...withCard, ...withoutCard];
  }, [book.characters, charactersWithCards, characterCardsMap]);

  const availableCharacters = useMemo(() => {
    if (!book.characters?.length) return [];
    if (!charactersWithCards.length) return book.characters.map((c) => c.name);
    return book.characters.map((c) => c.name).filter((n) => !charactersWithCards.includes(n));
  }, [book.characters, charactersWithCards]);

  const canAddCards = availableCharacters.length > 0 && !!meId;

  // ── Character card modals ─────────────────────────────────────────────────

  const [pagePickerVisible, setPagePickerVisible] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectVisible, setSelectVisible] = useState(false);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
  const [selectedPageImageUri, setSelectedPageImageUri] = useState<string | null>(null);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const closeAllModals = () => {
    setPagePickerVisible(false);
    setCropVisible(false);
    setSelectVisible(false);
    setSelectedPageIndex(null);
    setSelectedPageImageUri(null);
    setCurrentRect(null);
    setSubmitError(null);
    setSubmitting(false);
  };

  const getPageImageUri = (pageIndex: number): string => {
    const anyBook: any = book;
    if (Array.isArray(anyBook.pages) && anyBook.pages[pageIndex - 1]) {
      const p = anyBook.pages[pageIndex - 1];
      if (typeof p === "string") return p;
      if (p?.url) return p.url;
    }
    return book.cover;
  };

  const handleCharacterSelectConfirm = async (characterName: string, parodyName: string | null) => {
    if (!selectedPageIndex || !selectedPageImageUri || !currentRect || submitting || !meId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createCharacterCard(book.id, selectedPageIndex, {
        characterName,
        parodyName,
        imageUrl: normalizeNhentaiImageUrl(selectedPageImageUri),
        cropX: currentRect.x,
        cropY: currentRect.y,
        cropWidth: currentRect.width,
        cropHeight: currentRect.height,
        userId: meId,
      });
      closeAllModals();
      setRefreshKey((x) => x + 1);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to save character card");
      setSubmitting(false);
    }
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const DownloadBtn = () => {
    if (!dl && !local) {
      return (
        <View style={s.circleBtnWrap}>
          <Pressable onPress={handleDownloadOrDelete} style={[s.circleBtn, { backgroundColor: colors.tagBg }]} android_ripple={{ color: colors.accent + "22", borderless: false }} accessibilityLabel={t("book.download")}>
            <Feather name="download" size={19} color={colors.accent} />
          </Pressable>
        </View>
      );
    }
    if (!dl && local) {
      return (
        <View style={s.circleBtnWrap}>
          <Pressable onPress={handleDownloadOrDelete} style={[s.circleBtn, { backgroundColor: colors.tagBg }]} android_ripple={{ color: colors.accent + "22", borderless: false }} accessibilityLabel={t("book.removeDownload")}>
            <Feather name="trash-2" size={19} color={colors.accent} />
          </Pressable>
        </View>
      );
    }
    return (
      <View style={s.circleBtnWrap}>
        <Pressable onPress={cancel} style={[s.circleBtn, { backgroundColor: colors.tagBg }]} android_ripple={{ color: colors.accent + "22", borderless: false }} accessibilityLabel={t("book.cancelDownload")}>
          <Ring progress={pr} size={28} />
          <View style={s.dlInner}><Feather name="x" size={13} color={colors.accent} /></View>
        </Pressable>
      </View>
    );
  };

  const CommentsBtn = () => (
    <View style={s.circleBtnWrap}>
      <Pressable
        onPress={openComments}
        style={[s.circleBtn, { backgroundColor: colors.tagBg }]}
        android_ripple={{ color: colors.accent + "22", borderless: false }}
        accessibilityLabel="Comments"
      >
        <Feather name="message-circle" size={19} color={colors.accent} />
        {commentCount > 0 && (
          <View style={[s.badge, { backgroundColor: colors.accent }]}>
            <Text style={[s.badgeTxt, { color: colors.bg }]}>
              {commentCount > 99 ? "99+" : commentCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );

  const GalleryRow = () => (
    <View style={[s.galleryRow, { marginTop: 16, marginBottom: 4 }]}>
      <Text style={[s.galleryLabel, { color: colors.metaText }]}>{t("book.gallery")}</Text>
      <Pressable onPress={cycleCols} style={s.layoutBtn}>
        <Feather name="layout" size={17} color={colors.metaText} />
        <Text style={[s.layoutTxt, { color: colors.metaText }]}>{cols}×</Text>
      </Pressable>
    </View>
  );

  const Modals = () => (
    <>
      <PagePickerModal
        visible={pagePickerVisible}
        pagesCount={book.pagesCount || 1}
        onClose={closeAllModals}
        onSelect={(page, uri) => { setSelectedPageIndex(page); setSelectedPageImageUri(uri); setPagePickerVisible(false); setCropVisible(true); }}
        getPageImageUri={getPageImageUri}
      />
      <CharacterCropModal
        visible={cropVisible}
        imageUri={selectedPageImageUri ? normalizeNhentaiImageUrl(selectedPageImageUri) : normalizeNhentaiImageUrl(book.cover)}
        onCancel={() => { setCropVisible(false); setCurrentRect(null); }}
        onConfirm={(rect) => { setCurrentRect(rect); setCropVisible(false); setSelectVisible(true); }}
      />
      <CharacterSelectModal
        visible={selectVisible}
        characters={availableCharacters}
        parodies={(book.parodies ?? []).map((p) => p.name)}
        onCancel={() => { setSelectVisible(false); setCurrentRect(null); setSelectedPageIndex(null); setSelectedPageImageUri(null); setSubmitError(null); setSubmitting(false); }}
        onConfirm={handleCharacterSelectConfirm}
        currentUserId={meId}
        currentUsername={me?.username ?? null}
      />
      {submitError && <Text style={s.submitError}>{submitError}</Text>}
    </>
  );

  const TagsBlock = () => (
    <>
      <TagBlock label={t("tags.artists")} tags={book.artists as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
      <TagBlock
        label={t("tags.characters")}
        tags={characterTagsWithInfo as TagLite[]}
        modeOf={modeOf}
        cycle={cycle}
        onTagPress={onTagPress}
        renderLabelExtra={canAddCards ? (
          <Pressable onPress={() => { setSubmitError(null); setSelectedPageIndex(null); setSelectedPageImageUri(null); setCurrentRect(null); setPagePickerVisible(true); }} hitSlop={8} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
            <Feather name="settings" size={15} color={colors.metaText} />
          </Pressable>
        ) : null}
      />
      <TagBlock label={t("tags.parodies")} tags={book.parodies as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
      <TagBlock label={t("tags.groups")} tags={book.groups as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
      <TagBlock label={t("tags.categories")} tags={book.categories as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
      <TagBlock label={t("tags.languages")} tags={book.languages as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
      <TagBlock label={t("tags.tags")} tags={dedupTags as TagLite[]} modeOf={modeOf} cycle={cycle} onTagPress={onTagPress} />
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────

  const MetaRow = () => (
    <View style={s.metaRow}>
      <Feather name="hash" size={13} color={colors.metaText} />
      <Pressable onLongPress={() => Clipboard.setStringAsync(String(book.id))}>
        <Text style={[s.metaText, { color: colors.metaText }]}>{book.id}</Text>
      </Pressable>
      <Feather name="calendar" size={13} color={colors.metaText} style={s.metaIcon} />
      <Text style={[s.metaText, { color: colors.metaText }]}>{timeAgo(book.uploaded, resolvedDateFns)}</Text>
      <Feather name="heart" size={13} color={colors.metaText} style={s.metaIcon} />
      <Text style={[s.metaText, { color: colors.metaText }]}>{book.favorites}</Text>
      <Feather name="book-open" size={13} color={colors.metaText} style={s.metaIcon} />
      <Text style={[s.metaText, { color: colors.metaText }]}>{book.pagesCount}</Text>
    </View>
  );

  const ActionRow = () => (
    <View style={[s.actionRow, { marginTop: 14 }]}>
      <View style={{ borderRadius: 14, overflow: "hidden", flex: 1, minWidth: 80 }}>
        <Pressable onPress={handleReadPress} style={[s.readBtn, { backgroundColor: colors.accent }]} android_ripple={{ color: "#ffffff22", borderless: false }}>
          <Feather name={readBtn.restart ? "rotate-ccw" : "book-open"} size={18} color={colors.bg} />
          <Text style={[s.readTxt, { color: colors.bg }]}>{readBtn.label}</Text>
        </Pressable>
      </View>
      <DownloadBtn />
      <CommentsBtn />
      <View style={s.circleBtnWrap}>
        <Pressable onPress={toggleLike} style={[s.circleBtn, { backgroundColor: colors.tagBg }]} android_ripple={{ color: colors.accent + "22", borderless: false }} accessibilityLabel={liked ? "Remove from favorites" : "Add to favorites"}>
          <FontAwesome name={liked ? "heart" : "heart-o"} size={19} color={liked ? "#FF5A5F" : colors.accent} />
        </Pressable>
      </View>
    </View>
  );

  // ── WIDE ─────────────────────────────────────────────────────────────────

  if (wide) {
    const coverW = Math.min(300, win.w * 0.28);
    return (
      <View style={{ paddingHorizontal: innerPadding, paddingTop: 20, paddingBottom: 8 }}>
        <View style={s.wideRow}>
          {/* Cover */}
          <View style={{ width: coverW }}>
            <Pressable onPress={handleReadPress} style={[s.wideCover, { aspectRatio: coverAR, backgroundColor: colors.page }]}>
              <ExpoImage source={buildImageFallbacks(book.cover)} style={{ width: "100%", height: "100%", pointerEvents: "none" as const }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            </Pressable>
          </View>

          {/* Right column */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.pretty)}>
              <Text style={[s.widePrettyTitle, { color: colors.txt }]} numberOfLines={3}>{book.title.pretty}</Text>
            </Pressable>
            {book.title.english && book.title.english !== book.title.pretty && (
              <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.english)}>
                <Text style={[s.subTitle, { color: colors.metaText }]} numberOfLines={2}>{book.title.english}</Text>
              </Pressable>
            )}
            {book.title.japanese && book.title.japanese !== book.title.english && (
              <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.japanese)}>
                <Text style={[s.subTitle, { color: colors.metaText, fontStyle: "italic" }]} numberOfLines={2}>{book.title.japanese}</Text>
              </Pressable>
            )}
            {!!book.scanlator && <Text style={[s.scanlator, { color: colors.metaText }]}>Scanlated by {book.scanlator}</Text>}
            <MetaRow />
            <ActionRow />
            <TagsBlock />
            <GalleryRow />
            <Modals />
          </View>
        </View>
      </View>
    );
  }

  // ── MOBILE ────────────────────────────────────────────────────────────────

  const contentW = containerW - pad * 2;
  const cardW = contentW * 0.78;

  return (
    <View style={{ paddingHorizontal: pad, position: "relative" }}>
      {/* Blurred background cover */}
      <View style={{ width: containerW, alignSelf: "center", aspectRatio: coverAR, overflow: "hidden" }}>
        <ExpoImage source={buildImageFallbacks(book.cover)} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} />
        <LinearGradient colors={[`${colors.bg}ff`, `${colors.bg}b8`, `${colors.bg}ff`]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </View>

      {/* Floating card */}
      <View style={[s.mobileCard, { left: (contentW - cardW) / 2, top: contentW * 0.1, width: cardW, height: cardW * 1.35, backgroundColor: colors.page }]}>
        <Pressable onPress={handleReadPress} style={{ width: "100%", height: "100%" }}>
          <ExpoImage source={buildImageFallbacks(book.cover)} style={{ width: "100%", height: "100%", pointerEvents: "none" as const }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        </Pressable>
      </View>

      {/* Content */}
      <View style={{ marginTop: cardW * 1.35 + contentW * 0.1 + 12 - contentW / (coverAR || 0.75) }}>
        <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.pretty)}>
          <Text style={[s.mobilePrettyTitle, { color: colors.txt }]}>{book.title.pretty}</Text>
        </Pressable>
        {book.title.english && book.title.english !== book.title.pretty && (
          <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.english)}>
            <Text style={[s.subTitle, { color: colors.metaText }]}>{book.title.english}</Text>
          </Pressable>
        )}
        {book.title.japanese && book.title.japanese !== book.title.english && (
          <Pressable onLongPress={() => Clipboard.setStringAsync(book.title.japanese)}>
            <Text style={[s.subTitle, { color: colors.metaText, fontStyle: "italic" }]}>{book.title.japanese}</Text>
          </Pressable>
        )}
        {!!book.scanlator && <Text style={[s.scanlator, { color: colors.metaText }]}>Scanlated by {book.scanlator}</Text>}
        <MetaRow />
        <ActionRow />
        <TagsBlock />
        <GalleryRow />
        <Modals />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wideRow: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  wideCover: { width: "100%", borderRadius: 18, overflow: "hidden", elevation: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  widePrettyTitle: { fontSize: 22, fontWeight: "800", lineHeight: 28, marginBottom: 4 },
  mobileCard: { position: "absolute", borderRadius: 24, overflow: "hidden", elevation: 8, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  mobilePrettyTitle: { fontSize: 19, fontWeight: "800", lineHeight: 24, marginBottom: 4 },
  subTitle: { fontSize: 13, marginBottom: 2 },
  scanlator: { fontSize: 12, marginTop: 4, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 8 },
  metaText: { fontSize: 13 },
  metaIcon: { marginLeft: 10 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  readBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 14, paddingVertical: 10 },
  readTxt: { fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  circleBtnWrap: { borderRadius: 20, overflow: "hidden" },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dlInner: { position: "absolute", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center" },
  badgeTxt: { fontSize: 9, fontWeight: "800" },
  galleryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  galleryLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
  layoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  layoutTxt: { fontSize: 12 },
  submitError: { color: "#ff6b6b", fontSize: 12, marginTop: 4 },
});
