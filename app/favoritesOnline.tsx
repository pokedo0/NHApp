import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";

import { Book } from "@/api/nhentai";
import { getFavoritesOnline, getMe } from "@/api/nhentaiOnline";
import BookListOnline from "@/components/BookListOnline";
import PaginationBar from "@/components/PaginationBar";
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

  useEffect(() => {
    AsyncStorage.getItem(INFINITE_SCROLL_KEY).then((value) => {
      setInfiniteScroll(value === "true");
    });
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const me = await getMe();
      setHasAuth(!!me);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useFocusEffect(
    useCallback(() => {
      setAuthChecked(false);
      checkAuth();
    }, [checkAuth])
  );

  const loadPage = useCallback(
    async (pageNum: number) => {
      if (!hasAuth) {
        setBooks([]);
        setPage(1);
        setTotalPages(1);
        return;
      }
      const { books: fetched, totalPages: tp } = await getFavoritesOnline({
        page: pageNum,
      });
      if (infiniteScroll) {
        setBooks((prev) => (pageNum === 1 ? fetched : [...prev, ...fetched]));
      } else {
        setBooks(fetched);
        if (pageNum > 1) {
          scrollToTop(scrollRef);
        }
      }
      setTotalPages(tp);
      setPage(pageNum);
    },
    [hasAuth, infiniteScroll]
  );

  useEffect(() => {
    loadPage(1);
    scrollToTop(scrollRef);
  }, [hasAuth, loadPage]);

  const onEnd = () => {
    if (infiniteScroll && page < totalPages) {
      loadPage(page + 1);
    }
  };

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

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <BookListOnline
        data={books}
        loading={hasAuth && books.length === 0 && authChecked}
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
          onChange={(p) => {
            loadPage(p);
          }}
          scrollRef={scrollRef}
          hideWhenInfiniteScroll={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
