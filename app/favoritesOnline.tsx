import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Book } from "@/api/nhentai";
import { getFavorites, hasSession } from "@/api/v2";
import { BROWSE_CARDS_PER_PAGE } from "@/utils/browseGridPageSize";
import { galleryCardToBook } from "@/api/v2/compat";
import BookListOnline from "@/components/BookListOnline";
import PaginationBar from "@/components/PaginationBar";
import { subscribeToStorageApplied } from "@/api/cloudStorage";
import { INFINITE_SCROLL_KEY } from "@/components/settings/keys";
import { scrollToTop } from "@/utils/scrollToTop";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";

export default function FavoritesOnlineScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const gridConfig = useGridConfig();

  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [infiniteScroll, setInfiniteScroll] = useState(false);
  const scrollRef = useRef<FlatList<Book> | null>(null);

  const [hasAuth, setHasAuth] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const loadingRef = useRef(false);
  const [everLoaded, setEverLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LOAD_SAFETY_MS = 25_000;

  const loadInfiniteScrollSetting = useCallback(() => {
    AsyncStorage.getItem(INFINITE_SCROLL_KEY).then((value) => {
      setInfiniteScroll(value === "true");
    });
  }, []);

  useEffect(() => {
    loadInfiniteScrollSetting();
    const unsub = subscribeToStorageApplied(loadInfiniteScrollSetting);
    return unsub;
  }, [loadInfiniteScrollSetting]);

  const checkAuth = useCallback(async () => {
    try {
      setHasAuth(await hasSession());
    } catch {
      setHasAuth(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!authChecked) checkAuth();
    }, [authChecked, checkAuth])
  );

  const loadPage = useCallback(
    async (pageNum: number) => {
      if (!hasAuth) {
        setBooks([]);
        setPage(1);
        setTotalPages(1);
        setEverLoaded(true);
        setLoadError(false);
        return;
      }
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoadingBooks(true);
      setLoadError(false);
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = setTimeout(() => {
        if (!loadingRef.current) return;
        loadingRef.current = false;
        setLoadingBooks(false);
        setEverLoaded(true);
        setLoadError(true);
        loadTimeoutRef.current = null;
      }, LOAD_SAFETY_MS);

      try {
        const res = await getFavorites({
          page: pageNum,
          per_page: BROWSE_CARDS_PER_PAGE,
        });
        const tp = res.num_pages;
        const newBooks = res.result.map(galleryCardToBook);

        setTotalPages(tp);
        setPage(pageNum);

        if (pageNum === 1 || !infiniteScroll) setBooks([]);
        if (pageNum > 1 && !infiniteScroll) scrollToTop(scrollRef);

        if (newBooks.length === 0) {
          setEverLoaded(true);
          return;
        }

        if (pageNum > 1 && infiniteScroll) {
          setBooks((prev) => [...prev, ...newBooks]);
        } else {
          setBooks(newBooks);
        }
      } finally {
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        loadingRef.current = false;
        setLoadingBooks(false);
        setEverLoaded(true);
      }
    },
    [hasAuth, infiniteScroll]
  );

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!hasAuth || !authChecked) return;
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    const t = setTimeout(() => {
      loadPage(1);
      scrollToTop(scrollRef);
    }, 0);
    return () => clearTimeout(t);
  }, [hasAuth, authChecked, loadPage]);

  const onEnd = useCallback(() => {
    if (infiniteScroll && page < totalPages) loadPage(page + 1);
  }, [infiniteScroll, page, totalPages, loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(1);
    setRefreshing(false);
  }, [loadPage]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleRefresh = async () => {
      globalThis.dispatchEvent?.(
        new globalThis.CustomEvent("app:refresh-content-start")
      );
      try {
        await onRefresh();
      } finally {
        globalThis.dispatchEvent?.(
          new globalThis.CustomEvent("app:refresh-content-end")
        );
      }
    };
    globalThis.addEventListener?.("app:refresh-content", handleRefresh);
    return () => {
      globalThis.removeEventListener?.("app:refresh-content", handleRefresh);
    };
  }, [onRefresh]);

  const onAfterUnfavorite = useCallback((removedIds: number[]) => {
    if (!removedIds?.length) return;
    setBooks((prev) => prev.filter((b) => !removedIds.includes(b.id)));
  }, []);

  const showLoading = loadingBooks || (hasAuth && authChecked && !everLoaded);

  if (loadError && books.length === 0 && !loadingBooks && hasAuth) {
    return (
      <View
        style={[
          styles.flex,
          styles.retryWrap,
          { backgroundColor: colors.bg },
        ]}
      >
        <Text style={[styles.retryText, { color: colors.sub }]}>
          Не удалось загрузить. Проверьте сеть или попробуйте позже.
        </Text>
        <Pressable
          onPress={() => {
            setLoadError(false);
            loadPage(1);
          }}
          style={[styles.retryBtn, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.retryBtnText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <BookListOnline
        data={books}
        loading={showLoading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={infiniteScroll ? onEnd : undefined}
        onPress={(id) =>
          router.push({
            pathname: "/book/[id]",
            params: {
              id: String(id),
              title: books.find((b) => b.id === id)?.title.pretty,
            },
          })
        }
        gridConfig={{ default: gridConfig }}
        onAfterUnfavorite={onAfterUnfavorite}
        scrollRef={scrollRef}
      />
      {!infiniteScroll && hasAuth && (
        <PaginationBar
          currentPage={page}
          totalPages={totalPages}
          onChange={(p) => loadPage(p)}
          scrollRef={scrollRef}
          hideWhenInfiniteScroll={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  retryWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  retryText: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 15,
  },
});
