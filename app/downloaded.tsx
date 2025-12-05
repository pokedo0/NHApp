import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text } from "react-native";

import { Book, BookPage } from "@/api/nhentai";
import BookList from "@/components/BookList";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useI18n } from "@/lib/i18n/I18nContext";

export default function DownloadedScreen() {
  const [downloadedBooks, setDownloadedBooks] = useState<Book[]>([]);
  const [pending, setPending] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const gridConfig = useGridConfig();
  const { t } = useI18n();

  const fetchDownloadedBooks = useCallback(async () => {
    setPending(true);
    try {
      const nhDir = `${FileSystem.documentDirectory}NHAppAndroid/`;
      const exists = (await FileSystem.getInfoAsync(nhDir)).exists;
      if (!exists) {
        setDownloadedBooks([]);
        return;
      }

      const titles = await FileSystem.readDirectoryAsync(nhDir);
      const books: Book[] = [];

      for (const title of titles) {
        const titleDir = `${nhDir}${title}/`;
        const idMatch = title.match(/^(\d+)_/);
        const titleId = idMatch ? Number(idMatch[1]) : null;
        const langs = await FileSystem.readDirectoryAsync(titleDir);

        for (const lang of langs) {
          const langDir = `${titleDir}${lang}/`;
          const metaUri = `${langDir}metadata.json`;
          if ((await FileSystem.getInfoAsync(metaUri)).exists) {
            const raw = await FileSystem.readAsStringAsync(metaUri);
            const book: Book = JSON.parse(raw);
            if (titleId && book.id !== titleId) continue;

            const files = await FileSystem.readDirectoryAsync(langDir);
            const pages = files
              .filter((f) => f.startsWith("Image"))
              .map(
                (img, i): BookPage => ({
                  url: `${langDir}${img}`,
                  urlThumb: `${langDir}${img}`,
                  width: book.pages[i]?.width || 100,
                  height: book.pages[i]?.height || 100,
                  page: i + 1,
                })
              );
            books.push({
              ...book,
              cover: pages[0]?.url || book.cover,
              thumbnail: pages[0]?.urlThumb || book.thumbnail,
              pages,
            });
          }
        }
      }

      books.sort((a, b) => b.id - a.id);
      const unique = Array.from(
        books
          .reduce(
            (map, b) => (map.has(b.id) ? map : map.set(b.id, b)),
            new Map<number, Book>()
          )
          .values()
      );
      setDownloadedBooks(unique);
    } catch (e) {
      console.error("Error reading downloads:", e);
      setDownloadedBooks([]);
    } finally {
      setPending(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDownloadedBooks();
    }, [fetchDownloadedBooks])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDownloadedBooks();
    setRefreshing(false);
  }, [fetchDownloadedBooks]);

  return (
    <BookList
      data={downloadedBooks}
      loading={pending}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onPress={(id) =>
        router.push({
          pathname: "/book/[id]",
          params: {
            id: String(id),
            title: downloadedBooks.find((b) => b.id === id)?.title.pretty,
          },
        })
      }
      ListEmptyComponent={
        !pending && downloadedBooks.length === 0 ? (
          <Text style={{ textAlign: "center", marginTop: 40, color: "#888" }}>
            {t("downloaded.noHaveADownloadBook")}
          </Text>
        ) : null
      }
      gridConfig={{ default: gridConfig }}
    />
  );
}
