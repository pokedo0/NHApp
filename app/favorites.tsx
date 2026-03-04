import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";

import { requestStoragePush } from "@/api/cloudStorage";
import { Book, getFavorites } from "@/api/nhentai";
import BookList from "@/components/BookList";
import { scrollToTop } from "@/utils/scrollToTop";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";

export default function FavoritesScreen() {
  const { colors } = useTheme();
  const [books, setBooks] = useState<Book[]>([]);
  const [ids, setIds] = useState<number[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const gridConfig = useGridConfig();
  const scrollRef = useRef<FlatList<Book> | null>(null);

  const loadFavoriteIds = useCallback(() => {
    AsyncStorage.getItem("bookFavorites").then((j) => {
      const list = j ? (JSON.parse(j) as number[]) : [];
      setIds(list);
      setFavorites(new Set(list));
    });
  }, []);

  useEffect(loadFavoriteIds, [loadFavoriteIds]);
  useFocusEffect(loadFavoriteIds);

  const loadBooks = useCallback(
    async (pageNum: number, perPage: number = 200) => {
      if (ids.length === 0) {
        setBooks([]);
        setTotalPages(1);
        return;
      }
      const start = (pageNum - 1) * perPage;
      const pageIds = ids.slice(start, start + perPage);
      if (pageIds.length === 0) return;

      try {
        const { books: fetched, totalPages: tp } = await getFavorites({
          ids: pageIds,
          perPage,
        });
        const ordered = pageIds
          .slice()
          .reverse()
          .map((id) => fetched.find((b: { id: number; }) => b.id === id))
          .filter((b): b is Book => !!b);
        setBooks((prev) => (pageNum === 1 ? ordered : [...prev, ...ordered]));
        setTotalPages(tp);
        setPage(pageNum);
      } catch (e) {
        console.error("Failed loading favorites:", e);
      }
    },
    [ids]
  );

  useEffect(() => {
    loadBooks(1);
  }, [ids, loadBooks]);

  const handleLoadMore = () => {
    if (page < totalPages) {
      loadBooks(page + 1);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBooks(1);
    setRefreshing(false);
    scrollToTop(scrollRef);
  }, [loadBooks]);

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

  const toggleFavorite = useCallback((id: number, next: boolean) => {
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) {
        copy.add(id);
        const newList = [...copy];
        setIds(newList);
        AsyncStorage.setItem("bookFavorites", JSON.stringify(newList));
        requestStoragePush();
      } else {
        copy.delete(id);
        setBooks((prevBooks) => prevBooks.filter((b) => b.id !== id));
        const newList = [...copy];
        setIds(newList);
        AsyncStorage.setItem("bookFavorites", JSON.stringify(newList));
        requestStoragePush();
      }
      return copy;
    });
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <BookList
        data={books}
        loading={ids.length > 0 && books.length === 0}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={handleLoadMore}
        isFavorite={(id) => favorites.has(id)}
        onToggleFavorite={toggleFavorite}
        onPress={(id) =>
          router.push({ pathname: "/book/[id]", params: { id: String(id), title: books.find(b => b.id === id)?.title.pretty } })
        }
        ListEmptyComponent={
          ids.length === 0 ? (
            <Text
              style={{ textAlign: "center", marginTop: 40, color: colors.sub }}
            >
              Ещё нет избранного
            </Text>
          ) : null
        }
        gridConfig={{ default: gridConfig }}
        scrollRef={scrollRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
