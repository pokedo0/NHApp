import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Platform, SectionList, StyleSheet, Text, View } from "react-native";

import { Book, getFavorites } from "@/api/nhentai";
import BookListHistory, { READ_HISTORY_KEY, ReadHistoryEntry } from "@/components/BookListHistory";
import { scrollToTop } from "@/utils/scrollToTop";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";

const PER_PAGE = 2000;

export default function HistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const gridConfig = useGridConfig();

  const [books, setBooks] = useState<Book[]>([]);
  const [ids, setIds] = useState<number[]>([]);
  const [histIndex, setHistIndex] = useState<Record<number, ReadHistoryEntry>>({});
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<SectionList<any>>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(ids.length / PER_PAGE)), [ids.length]);

  const loadHistoryIndex = useCallback(async () => {
    const raw = await AsyncStorage.getItem(READ_HISTORY_KEY);
    if (!raw) {
      setIds([]);
      setHistIndex({});
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setIds([]);
      setHistIndex({});
      return;
    }
    const arr = Array.isArray(parsed) ? (parsed as ReadHistoryEntry[]) : [];
    const byId = new Map<number, ReadHistoryEntry>();
    for (const e of arr) {
      if (!e || !Array.isArray(e)) continue;
      const [id, curr, total, ts] = e;
      const prev = byId.get(id);
      if (!prev || (prev[3] || 0) < (ts || 0)) byId.set(id, [id, curr, total, ts]);
    }
    const sortedIds = [...byId.values()].sort((a, b) => (b[3] || 0) - (a[3] || 0)).map((e) => e[0]);
    const indexObj: Record<number, ReadHistoryEntry> = {};
    for (const [id, entry] of byId) indexObj[id] = entry;
    setIds(sortedIds);
    setHistIndex(indexObj);
  }, []);

  const loadFavorites = useCallback(() => {
    AsyncStorage.getItem("bookFavorites").then((j) => {
      const list = j ? (JSON.parse(j) as number[]) : [];
      setFavorites(new Set(list));
    });
  }, []);

  useEffect(() => {
    loadHistoryIndex();
    loadFavorites();
  }, [loadHistoryIndex, loadFavorites]);

  useFocusEffect(
    useCallback(() => {
      loadHistoryIndex();
      loadFavorites();
    }, [loadHistoryIndex, loadFavorites])
  );

  const reqIdRef = useRef(0);

  const loadBooks = useCallback(
    async (pageNum: number) => {
      if (ids.length === 0) {
        setBooks([]);
        setPage(1);
        return;
      }
      const start = (pageNum - 1) * PER_PAGE;
      const pageIds = ids.slice(start, start + PER_PAGE);
      if (pageIds.length === 0) return;

      const myReq = ++reqIdRef.current;
      if (pageNum === 1) setBooks([]);
      if (pageNum > 1) setIsLoadingMore(true);

      try {
        const { books: fetched } = await getFavorites({ ids: pageIds, perPage: PER_PAGE });
        if (reqIdRef.current !== myReq) return;
        const ordered = pageIds.map((id) => fetched.find((b) => b.id === id)).filter((b): b is Book => !!b);
        setBooks((prev) => (pageNum === 1 ? ordered : [...prev, ...ordered]));
        setPage(pageNum);
      } catch {
      } finally {
        if (pageNum > 1) setIsLoadingMore(false);
      }
    },
    [ids]
  );

  useEffect(() => {
    loadBooks(1);
  }, [ids, loadBooks]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return;
    if (page >= totalPages) return;
    loadBooks(page + 1);
  }, [isLoadingMore, page, totalPages, loadBooks]);

  const toggleFavorite = useCallback((id: number, next: boolean) => {
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) {
        copy.add(id);
        AsyncStorage.setItem("bookFavorites", JSON.stringify([...copy]));
      } else {
        copy.delete(id);
        AsyncStorage.setItem("bookFavorites", JSON.stringify([...copy]));
      }
      return copy;
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistoryIndex();
    loadFavorites();
    await loadBooks(1);
    setRefreshing(false);
    scrollToTop(scrollRef);
  }, [loadHistoryIndex, loadBooks, loadFavorites]);

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

  const footer = useMemo(() => (isLoadingMore ? <View style={{ marginVertical: 16 }}><LoadingSpinner size="small" /></View> : null), [isLoadingMore]);

  const initialLoading = ids.length > 0 && books.length === 0 && !refreshing;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <BookListHistory
        data={books}
        historyIndex={histIndex}
        loading={initialLoading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={handleLoadMore}
        isFavorite={(id) => favorites.has(id)}
        onToggleFavorite={toggleFavorite}
        onPress={(id) =>
          router.push({
            pathname: "/book/[id]",
            params: { id: String(id), title: books.find((b) => b.id === id)?.title.pretty },
          })
        }
        ListEmptyComponent={ids.length === 0 ? <Text style={{ textAlign: "center", marginTop: 40, color: colors.sub }}>История пуста</Text> : null}
        ListFooterComponent={footer}
        gridConfig={{ default: gridConfig }}
        scrollRef={scrollRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
