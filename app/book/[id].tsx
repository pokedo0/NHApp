import type { Book } from "@/api/nhentai";
import { getRandomGalleryId, getGallery, getMe, initCdn } from "@/api/v2";
import { galleryToBook } from "@/api/v2/compat";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFilterTags } from "@/context/TagFilterContext";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { isElectron, openReaderWindow } from "@/electron/bridge";
import { useBookData } from "@/hooks/book/useBookData";
import { useColumns } from "@/hooks/book/useColumns";
import { useDownload } from "@/hooks/book/useDownload";
import { useFab } from "@/hooks/book/useFab";
import { useFavorites } from "@/hooks/book/useFavorites";
import { useRelatedComments } from "@/hooks/book/useRelatedComments";
import { useWindowLayout } from "@/hooks/book/useWindowLayout";

import Footer from "@/components/book/Footer";
import Hero from "@/components/book/Hero";
import PageItem, { GAP } from "@/components/book/PageItem";
import { useI18n } from "@/lib/i18n/I18nContext";

export default function BookScreen() {
  const { id, random } = useLocalSearchParams<{
    id: string;
    random?: string;
  }>();
  const [myUserId, setMyUserId] = useState<number | undefined>(undefined);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | undefined>(undefined);
  const [myUsername, setMyUsername] = useState<string | undefined>(undefined);

  const idNum = Number(id);
  const fromRandom = random === "1";

  const router = useRouter();
  const { colors } = useTheme();
  const baseGrid = useGridConfig();

  const { t } = useI18n();

  const { filters, cycle } = useFilterTags();

  const { win, wide, innerPadding } = useWindowLayout();
  const { book, setBook, local, setLocal } = useBookData(idNum);
  const {
    related,
    relLoading,
    refetchRelated,
    allComments,
    visibleCount,
    setVisibleCount,
    cmtLoading,
    refetchComments,
  } = useRelatedComments(book);
  const { favorites, toggleFav, liked, toggleLike } = useFavorites(idNum);
  const { dl, pr, handleDownloadOrDelete, cancel } = useDownload(
    book,
    local,
    setLocal,
    setBook
  );

  const { cols, cycleCols, listRef, setScrollY } = useColumns(wide);

  const {
    fabScale,
    onScroll: onScrollFab,
    scrollTop,
    scrollToComments,
    handleFabPress,
    scrollDirection,
    listRef: fabListRef,
    setCommentSectionOffset,
  } = useFab();

  const [listW, setListW] = useState(win.w);
  const [rndLoading, setRndLoading] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);
  const scrollPositionRef = useRef<number>(0);
  const prevDataLengthRef = useRef<number>(0);
  const prevColsRef = useRef<number>(cols);
  useEffect(() => {
    setListW(win.w);
  }, [win.w]);

  useEffect(() => {
    if (prevColsRef.current !== cols && scrollPositionRef.current > 0) {
      const currentScrollY = scrollPositionRef.current;
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (listRef.current && currentScrollY > 0) {
            listRef.current.scrollToOffset({ offset: currentScrollY, animated: false });
          }
        }, 150);
      });
    }
    prevColsRef.current = cols;
  }, [cols]);

  const modeOf = useCallback(
    (t: { type: string; name: string }): "include" | "exclude" | undefined => {
      const m = filters.find(
        (f) => f.type === t.type && f.name === t.name
      )?.mode;
      return m === "include" || m === "exclude" ? m : undefined;
    },
    [filters]
  );

  useEffect(() => {
    if (book?.title?.pretty) {
      router.setParams({ title: book.title.pretty });
    }
  }, [book?.title?.pretty]);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => {
        if (!alive) return;
        setMyUserId(me?.id ?? undefined);
        setMyAvatarUrl(me?.avatar_url ?? undefined);
        setMyUsername(me?.username ?? undefined);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const headerEl = useMemo(() => {
    if (!book) return null;
    return (
      <Hero
        book={book}
        containerW={listW || win.w}
        pad={innerPadding}
        wide={wide}
        cols={cols}
        cycleCols={cycleCols}
        liked={liked}
        toggleLike={toggleLike}
        dl={dl}
        pr={pr}
        local={local}
        handleDownloadOrDelete={handleDownloadOrDelete}
        modeOf={modeOf}
        onTagPress={(name: any) =>
          router.push({
            pathname: "/explore",
            params: { query: name, solo: "1" },
          })
        }
        win={win}
        innerPadding={innerPadding}
        cycle={cycle}
        cancel={cancel}
      />
    );
  }, [
    book,
    listW,
    win,
    innerPadding,
    wide,
    cols,
    liked,
    dl,
    pr,
    local,
    handleDownloadOrDelete,
    modeOf,
    router,
    cycle,
  ]);

  const handleCommentSectionLayout = useCallback((offset: number) => {
    setCommentSectionOffset(offset);
  }, [setCommentSectionOffset]);

  const horizPad = Math.max(0, innerPadding - GAP / 2);

  const limitedPages = useMemo(() => {
    if (!book?.pages || showAllPages) {
      return book?.pages || [];
    }
    const targetCount = 24;
    const rows = Math.floor(targetCount / cols);
    const limitedCount = rows * cols;
    return book.pages.slice(0, limitedCount);
  }, [book?.pages, cols, showAllPages]);

  useEffect(() => {
    if (showAllPages && prevDataLengthRef.current > 0) {
      const currentScrollY = scrollPositionRef.current;
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (listRef.current && currentScrollY > 0) {
            listRef.current.scrollToOffset({ offset: currentScrollY, animated: false });
          }
        }, 100);
      });
    }
    prevDataLengthRef.current = limitedPages.length;
  }, [showAllPages, limitedPages.length]);

  const showAllButton = useMemo(() => {
    if (showAllPages || !book?.pages || limitedPages.length >= book.pages.length) {
      return null;
    }
    return (
      <View style={{ paddingVertical: 20, paddingHorizontal: horizPad, alignItems: 'center' }}>
        <Pressable
          onPress={() => {
            setShowAllPages(true);
          }}
          android_ripple={{ color: "#ffffff22", borderless: false }}
          style={({ pressed }) => [
            {
              backgroundColor: colors.accent,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
              minWidth: 120,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed &&
              (Platform.select({
                android: { opacity: 0.96, transform: [{ scale: 0.995 }] },
                ios: { opacity: 0.85 },
              }) as any),
          ]}
        >
          <Text style={{ color: colors.bg, fontSize: 14, fontWeight: "600" }}>
            {t("book.showAll") || "Показать всё"}
          </Text>
        </Pressable>
      </View>
    );
  }, [showAllPages, book?.pages, limitedPages.length, horizPad, colors, t]);

  const footerEl = useMemo(() => {
    return (
      <Footer
        galleryId={book?.id ?? idNum}
        related={related}
        relLoading={relLoading}
        refetchRelated={refetchRelated}
        favorites={favorites}
        toggleFav={toggleFav}
        baseGrid={baseGrid}
        allComments={allComments}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        cmtLoading={cmtLoading}
        innerPadding={innerPadding}
        myUserId={myUserId}
        myAvatarUrl={myAvatarUrl}
        myUsername={myUsername}
        refetchComments={refetchComments}
        onCommentSectionLayout={handleCommentSectionLayout}
      />
    );
  }, [
    related,
    relLoading,
    refetchRelated,
    favorites,
    toggleFav,
    baseGrid,
    allComments,
    visibleCount,
    setVisibleCount,
    cmtLoading,
    innerPadding,
    myUserId,
    myAvatarUrl,
    myUsername,
    book?.id,
    idNum,
    refetchComments,
    handleCommentSectionLayout,
  ]);

  const itemW = useMemo(() => {
    const availableWidth = Math.max(100, (listW || win.w) - 2 * horizPad);
    if (cols === 1) {
      return availableWidth;
    }
    const calculatedWidth = Math.floor((availableWidth - (cols - 1) * GAP) / cols);
    return Math.max(100, Math.min(calculatedWidth, availableWidth));
  }, [cols, listW, win.w, horizPad]);

  const getItemHeight = useCallback((page: Book["pages"][number]) => {
    const aspectRatio = page.width / page.height;
    const isVertical = page.height > page.width;
    const isSuperLong = isVertical && page.height > page.width * 3;
    const maxHeight = isSuperLong ? itemW * 2.5 : undefined;
    const imageHeight = maxHeight
      ? Math.min(itemW / aspectRatio, maxHeight)
      : itemW / aspectRatio;
    return imageHeight + 12 + 4 + GAP;
  }, [itemW]);

  const itemHeights = useMemo(() => {
    if (!book?.pages) return [];
    return book.pages.map(page => getItemHeight(page));
  }, [book?.pages, getItemHeight]);


  const imageHeights = useMemo(() => {
    if (!limitedPages.length) return [];
    return limitedPages.map(page => {
      const aspectRatio = page.width / page.height;
      const isVertical = page.height > page.width;
      const isSuperLong = isVertical && page.height > page.width * 3;
      const maxHeight = isSuperLong ? itemW * 2.5 : undefined;
      return maxHeight
        ? Math.min(itemW / aspectRatio, maxHeight)
        : itemW / aspectRatio;
    });
  }, [limitedPages, itemW]);

  const openPage = useCallback(
    async (pageNum: number) => {
      const bid = book?.id;
      if (bid == null) return;
      if (isElectron()) {
        const ok = await openReaderWindow(bid, pageNum);
        if (!ok) {
          router.push({
            pathname: "/read",
            params: { id: String(bid), page: String(pageNum) },
          });
        }
      } else {
        router.push({
          pathname: "/read",
          params: { id: String(bid), page: String(pageNum) },
        });
      }
    },
    [book?.id, router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Book["pages"][number]; index: number }) => {
      let showBackground = false;
      if (cols > 1) {
        const rowIndex = Math.floor(index / cols);
        const rowStart = rowIndex * cols;
        const rowEnd = Math.min(rowStart + cols, imageHeights.length);
        const rowHeights = imageHeights.slice(rowStart, rowEnd);
        if (rowHeights.length > 0) {
          const minHeight = Math.min(...rowHeights);
          const maxHeight = Math.max(...rowHeights);
          const currentHeight = imageHeights[index];
          const allSameSize = Math.abs(maxHeight - minHeight) < 5;
          if (!allSameSize) {
            const isSmaller = currentHeight < maxHeight - 5; 
            showBackground = isSmaller;
          }
        }
      } else {
        const aspectRatio = item.width / item.height;
        const isVertical = item.height > item.width;
        const isSuperLong = isVertical && item.height > item.width * 3;
        showBackground = isSuperLong;
      }

      return (
        <PageItem
          page={item}
          itemW={itemW}
          cols={cols}
          metaColor={colors.metaText}
          onOpenPage={openPage}
          showBackground={showBackground}
        />
      );
    },
    [openPage, cols, itemW, colors.metaText, imageHeights]
  );

  const handleContentSizeChange = useCallback((contentWidth: number, contentHeight: number) => {
    if (contentHeight > 0) {
      const estimatedCommentOffset = contentHeight * 0.75;
      setCommentSectionOffset(estimatedCommentOffset);
    }
  }, [setCommentSectionOffset]);

  const goRandomAgain = useCallback(async () => {
    if (rndLoading) return;
    try {
      setRndLoading(true);
      await initCdn();
      const randomId = await getRandomGalleryId();
      const g = await getGallery(randomId);
      const b = galleryToBook(g);
      router.replace({
        pathname: "/book/[id]",
        params: { id: String(b.id), title: b.title.pretty, random: "1" },
      });
    } finally {
      setRndLoading(false);
    }
  }, [rndLoading, router]);

  if (!book) {
    return (
      <LoadingSpinner fullScreen size="large" color={colors.accent} />
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg }}
      onLayout={(e) => {
        const newWidth = e.nativeEvent.layout.width;
        if (Math.abs(newWidth - listW) > 1) {
          setListW(newWidth);
        }
      }}
    >
      <FlatList
        ref={(ref) => {
          (listRef as any).current = ref;
          (fabListRef as any).current = ref;
        }}
        data={limitedPages}
        key={`book-${book?.id}-${cols}`}
        numColumns={cols}
        {...(Platform.OS !== 'android' && {
          maintainVisibleContentPosition: {
            minIndexForVisible: 0,
            autoscrollToTopThreshold: null,
          },
        })}
        keyExtractor={(p) => String(p.page)}
        renderItem={renderItem}
        onScroll={(e) => {
          onScrollFab(e);
          setScrollY(e.nativeEvent.contentOffset.y);
        }}
        onContentSizeChange={(w, h) => {
          handleContentSizeChange(w, h);
          if (h > 0) {
            setCommentSectionOffset(h * 0.8);
          }
        }}
        onLayout={(e) => {
          const newWidth = e.nativeEvent.layout.width;
          if (Math.abs(newWidth - listW) > 1) {
            setListW(newWidth);
          }
        }}
        scrollEventThrottle={16}
        columnWrapperStyle={cols > 1 ? { 
          alignItems: "stretch", 
          paddingHorizontal: 0,
          justifyContent: 'center', 
        } : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: horizPad,
        }}
        ListHeaderComponent={headerEl}
        ListFooterComponent={
          <>
            {showAllButton}
            {footerEl}
          </>
        }
        removeClippedSubviews={false}
        initialNumToRender={cols === 1 ? 10 : 24}
        maxToRenderPerBatch={cols === 1 ? 10 : 24}
        updateCellsBatchingPeriod={50}
        windowSize={11}
      />

      <Animated.View
        style={[
          styles.fab,
          { transform: [{ scale: fabScale }], opacity: fabScale },
        ]}
      >
        <Pressable
          onPress={handleFabPress}
          style={[styles.fabBtn, { backgroundColor: colors.accent }]}
        >
          <Ionicons 
            name={scrollDirection === "down" ? "arrow-down" : "arrow-up"} 
            size={24} 
            color={colors.bg} 
          />
        </Pressable>
      </Animated.View>

      {fromRandom && (
        <View style={[styles.tryWrap, { bottom: 40 }]}>
          <View style={styles.tryRounded}>
            <Pressable
              disabled={rndLoading}
              onPress={goRandomAgain}
              android_ripple={{ color: "#ffffff22", borderless: false }}
              style={({ pressed }) => [
                styles.tryBtn,
                { backgroundColor: colors.accent },
                pressed &&
                  (Platform.select({
                    android: { opacity: 0.96, transform: [{ scale: 0.995 }] },
                    ios: { opacity: 0.85 },
                  }) as any),
              ]}
            >
              {rndLoading ? (
                <LoadingSpinner size="small" color={colors.bg} />
              ) : (
                <>
                  <Feather name="shuffle" size={16} color={colors.bg} />
                  <Text style={[styles.tryTxt, { color: colors.bg }]}>
                    {t("book.fromRandomCta")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const FAB_SIZE = 48;
const styles = StyleSheet.create({
  fab: { position: "absolute", right: 16, bottom: 36 },
  fabBtn: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },

  tryWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  tryRounded: {
    borderRadius: 12,
    overflow: "hidden",
  },
  tryBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 4,
  },
  tryTxt: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
