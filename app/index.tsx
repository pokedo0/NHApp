import { Book, getBook, searchBooks } from "@/api/nhentai";
import BookList from "@/components/BookList";
import PaginationBar from "@/components/PaginationBar";
import { useSort } from "@/context/SortContext";
import { useFilterTags } from "@/context/TagFilterContext";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

const ENV_IDS = (process.env.EXPO_PUBLIC_HOME_IDS || "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));

const SHOWCASE_IDS: number[] = ENV_IDS.length
  ? ENV_IDS
  : [
      // 594428,594853,594709,416364, 867,590764,570095,250889,231917,157815,499794,81238,397016,361518,328504,328532
    ];

export default function HomeScreen() {
  const { colors } = useTheme();
  const { sort } = useSort();
  const { includes, excludes, filtersReady } = useFilterTags();
  const incStr = JSON.stringify(includes);
  const excStr = JSON.stringify(excludes);

  const showcaseActive = SHOWCASE_IDS.length > 0;

  const [books, setBooks] = useState<Book[]>([]);
  const [totalPages, setTotal] = useState(1);
  const [currentPage, setPage] = useState(1);
  const [favorites, setFav] = useState<Set<number>>(new Set());
  const [refreshing, setRef] = useState(false);

  const listRef = useRef<FlatList>(null);
  const router = useRouter();
  const gridConfig = useGridConfig();

  const { update, progress, downloadAndInstall, checkUpdate } =
    useUpdateCheck();
  const { t } = useI18n();

  const accent = colors.accent;
  const bannerBg = colors.accent + "40";

  const Ring = ({
    progress,
    size = 17,
    stroke = 3,
  }: {
    progress: number;
    size?: number;
    stroke?: number;
  }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ marginRight: 16 }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={accent}
          strokeOpacity={0.25}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={accent}
          strokeWidth={stroke}
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - progress)}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          origin={`${size / 2},${size / 2}`}
        />
      </Svg>
    );
  };

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("bookFavorites").then(
        (j) => j && setFav(new Set(JSON.parse(j)))
      );
    }, [])
  );

  // — обычная пагинация
  const fetchPage = useCallback(
    async (pageNum: number) => {
      try {
        const res = await searchBooks({
          sort,
          page: pageNum,
          perPage: 40,
          includeTags: includes,
          excludeTags: excludes,
        });
        setBooks(res.books);
        setTotal(res.totalPages);
        setPage(pageNum);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch (error) {
        console.error("Failed to fetch books:", error);
      }
    },
    [sort, incStr, excStr]
  );

  const fetchShowcase = useCallback(async () => {
    setRef(true);
    try {
      const results = await Promise.all(
        SHOWCASE_IDS.map(async (id) => {
          try {
            const b = await getBook(id);
            return b as Book;
          } catch (e) {
            console.warn("[home:showcase] failed to load id", id, e);
            return null;
          }
        })
      );
      const onlyOk = results.filter(Boolean) as Book[];
      setBooks(onlyOk);
      setTotal(1);
      setPage(1);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } finally {
      setRef(false);
    }
  }, []);

  useEffect(() => {
    if (showcaseActive) {
      fetchShowcase();
    } else if (filtersReady) {
      fetchPage(1);
    }
  }, [filtersReady, fetchPage, fetchShowcase, showcaseActive]);

  useEffect(() => {
    if (!showcaseActive && filtersReady) setPage(1);
  }, [sort, incStr, excStr, filtersReady, showcaseActive]);

  const onRefresh = useCallback(async () => {
    setRef(true);
    try {
      if (showcaseActive) {
        await fetchShowcase();
      } else {
        await fetchPage(currentPage);
      }
      await checkUpdate();
    } finally {
      setRef(false);
    }
  }, [currentPage, fetchPage, fetchShowcase, checkUpdate, showcaseActive]);

  const toggleFav = useCallback((id: number, next: boolean) => {
    setFav((prev) => {
      const cp = new Set(prev);
      next ? cp.add(id) : cp.delete(id);
      AsyncStorage.setItem("bookFavorites", JSON.stringify([...cp]));
      return cp;
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {update && (
        <View style={{ backgroundColor: bannerBg }}>
          <TouchableOpacity
            style={[
              styles.updateBanner,
              progress !== null && styles.updateBannerDisabled,
            ]}
            activeOpacity={0.8}
            onPress={downloadAndInstall}
            disabled={progress !== null}
          >
            {progress === null ? (
              <>
                <Text style={[styles.updateTxt, { color: colors.txt }]}>
                  {t("downloadUpdate")} {update.versionName}
                </Text>
                <Feather name="download" size={17} color={colors.txt} />
              </>
            ) : (
              <>
                <Text style={[styles.updateTxt, { color: colors.txt }]}>
                  Скачивается {update.versionName}
                </Text>
                <Ring progress={progress} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {showcaseActive && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.accent + "14",
          }}
        >
          <Text
            style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}
          >
            Showcase mode • IDs: {SHOWCASE_IDS.join(", ")}
          </Text>
        </View>
      )}

      <BookList
        key={showcaseActive ? `showcase` : `page-${currentPage}`}
        data={books}
        loading={
          books.length === 0 && (!showcaseActive ? currentPage === 1 : true)
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        isFavorite={(id) => favorites.has(id)}
        onToggleFavorite={toggleFav}
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
      />

      {!showcaseActive && (
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          onChange={fetchPage}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },

  updateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  updateBannerDisabled: { opacity: 0.8 },
  updateTxt: { fontSize: 15, fontWeight: "500" },
});
