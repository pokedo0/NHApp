import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import {
    Book,
    DateSearchPhase,
    DateSearchProgress,
    searchBooks,
} from "@/api/nhentai";
import BookList from "@/components/BookList";
import NoResultsPanel from "@/components/NoResultsPanel";
import PaginationBar from "@/components/PaginationBar";
import { useDateRange } from "@/context/DateRangeContext";
import { useSort } from "@/context/SortContext";
import { useFilterTags } from "@/context/TagFilterContext";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";
import { INFINITE_SCROLL_KEY } from "@/components/settings/keys";
import { scrollToTop } from "@/utils/scrollToTop";

const EXPLORE_CACHE = new Map<string, { books: Book[]; totalPages: number }>();

type ProbeNow = {
  which: "start" | "end";
  page: number;
  headSec: number;
  tailSec: number;
  lo: number;
  hi: number;
  mid: number;
  decision?: "left" | "right" | "hit";
};
function hasProbe(p: DateSearchProgress): p is DateSearchProgress & {
  bounds: NonNullable<DateSearchProgress["bounds"]>;
  probe: NonNullable<DateSearchProgress["probe"]>;
} {
  return p.phase === "range:probe" && !!p.bounds && !!p.probe;
}

type ResultState = "idle" | "loading" | "no-results" | "timeout" | "error";

export default function ExploreScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useI18n();

  const { query: rawQ, solo: rawSolo } = useLocalSearchParams<{
    query?: string | string[];
    solo?: string | string[];
  }>();
  const urlQ = Array.isArray(rawQ) ? rawQ[0] : rawQ;
  const solo = Array.isArray(rawSolo) ? rawSolo[0] : rawSolo;

  const [query, setQuery] = useState(urlQ ?? "");
  const { sort, setSort } = useSort();
  const {
    includes,
    excludes,
    clearAll: clearAllTagFilters,
  } = useFilterTags() as any;
  const { from: dateFrom, to: dateTo, clearRange, isHydrated } = useDateRange();
  const dateFilterActive = !!dateFrom || !!dateTo;

  const useFilters = solo !== "1";
  const activeIncludes = useFilters ? includes : [];
  const activeExcludes = useFilters ? excludes : [];
  const hasTagFilters =
    (activeIncludes?.length ?? 0) > 0 || (activeExcludes?.length ?? 0) > 0;

  const incStr = JSON.stringify(activeIncludes);
  const excStr = JSON.stringify(activeExcludes);

  const [books, setBooks] = useState<Book[]>([]);
  const [totalPages, setTotal] = useState(1);
  const [currentPage, setPage] = useState(1);
  const [favorites, setFav] = useState<Set<number>>(new Set());

  const [resultState, setResultState] = useState<ResultState>("idle");
  const [errorMsg, setErr] = useState<string>("");

  const [stage, setStage] = useState<DateSearchPhase>("idle");
  const [probeNow, setProbeNow] = useState<ProbeNow | null>(null);
  const [windowInfo, setWindowInfo] = useState<{
    startIndex: number;
    endIndex: number;
    total: number;
  } | null>(null);

  const [isPaginating, setPaginating] = useState(false);
  const [infiniteScroll, setInfiniteScroll] = useState(false);
  const scrollRef = useRef<FlatList<Book> | null>(null);
  const prevPageRef = useRef(currentPage);

  const searching = dateFilterActive && stage !== "idle" && stage !== "done";
  const reqIdRef = useRef(0);
  const skipPageChangeRef = useRef(false);
  const booksLengthRef = useRef(books.length);
  const gridConfig = useGridConfig();

  const loadInfiniteScrollSetting = useCallback(() => {
    AsyncStorage.getItem(INFINITE_SCROLL_KEY).then((value) => {
      setInfiniteScroll(value === "true");
    });
  }, []);

  useEffect(() => {
    loadInfiniteScrollSetting();
  }, [loadInfiniteScrollSetting]);

  useFocusEffect(
    useCallback(() => {
      loadInfiniteScrollSetting();
    }, [loadInfiniteScrollSetting])
  );

  useEffect(() => {
    AsyncStorage.getItem("bookFavorites").then(
      (j) => j && setFav(new Set(JSON.parse(j)))
    );
  }, []);

  const cacheKey = useMemo(
    () =>
      JSON.stringify({
        q: query.trim(),
        sort,
        inc: activeIncludes,
        exc: activeExcludes,
        page: currentPage,
        from: dateFrom
          ? new Date(dateFrom as any).toISOString().slice(0, 10)
          : null,
        to: dateTo ? new Date(dateTo as any).toISOString().slice(0, 10) : null,
      }),
    [query, sort, incStr, excStr, currentPage, dateFrom, dateTo]
  );

  const fmt = (sec?: number) =>
    sec ? new Date(sec * 1000).toLocaleDateString() : "—";

  const probeSubtitle = useMemo(() => {
    if (!probeNow) return "";
    const dir =
      probeNow.decision === "right"
        ? t("explore.probe.directionRight") || "→ вправо"
        : probeNow.decision === "left"
        ? t("explore.probe.directionLeft") || "→ влево"
        : probeNow.decision === "hit"
        ? t("explore.probe.directionHit") || "✓ попадание"
        : "";
    const head = fmt(probeNow.headSec);
    const tail = fmt(probeNow.tailSec);
    const whichLabel =
      probeNow.which === "start"
        ? t("explore.probe.start") || "Начало"
        : t("explore.probe.end") || "Конец";
    return (
      (t("explore.probe.subtitle", {
        which: whichLabel,
        page: probeNow.page,
        head,
        tail,
        dir,
      }) as string) ||
      `${whichLabel}: p=${probeNow.page} • ${head} → ${tail} ${dir}`
    );
  }, [probeNow, t]);

  const Ring = ({
    progress,
    size = 20,
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
        style={{ marginLeft: 8 }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeOpacity={0.25}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
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

  const DateSearchPanel = () => {
    const pct =
      stage === "meta"
        ? 0.1
        : stage === "range:start"
        ? 0.3
        : stage === "range:end"
        ? 0.6
        : stage === "fetch"
        ? 0.85
        : stage === "done"
        ? 1
        : 0.05;

    const title =
      stage === "meta"
        ? t("explore.dateSearch.meta") || "Подготовка запроса…"
        : stage === "range:start"
        ? t("explore.dateSearch.rangeStart") || "Ищу начало окна…"
        : stage === "range:end"
        ? t("explore.dateSearch.rangeEnd") || "Ищу конец окна…"
        : stage === "fetch"
        ? t("explore.dateSearch.fetch") || "Загружаю страницы окна…"
        : stage === "done"
        ? t("explore.dateSearch.done") || "Готово"
        : t("explore.dateSearch.loading") || "Загрузка…";

    return (
      <View
        style={{
          backgroundColor: colors.accent + "10",
          borderBottomColor: colors.page,
          borderBottomWidth: StyleSheet.hairlineWidth,
        }}
      >
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.txt, fontWeight: "700" }}>
              {title}
            </Text>
            {!!probeSubtitle && (
              <Text
                style={{
                  color: colors.txt,
                  opacity: 0.8,
                  marginTop: 2,
                }}
              >
                {probeSubtitle}
              </Text>
            )}
            {windowInfo && stage === "fetch" && (
              <Text
                style={{
                  color: colors.txt,
                  opacity: 0.8,
                  marginTop: 2,
                }}
              >
                {(t("explore.dateSearch.windowInfo", {
                  start: windowInfo.startIndex,
                  end: windowInfo.endIndex,
                  total: windowInfo.total,
                }) as string) ||
                  `Окно: индексы ${windowInfo.startIndex}…${windowInfo.endIndex} • элементов ${windowInfo.total}`}
              </Text>
            )}
          </View>
          <Ring progress={pct} />
        </View>
      </View>
    );
  };

  useEffect(() => {
    booksLengthRef.current = books.length;
  }, [books.length]);

  const fetchPage = useCallback(
    async (page: number, keyForCache: string, append = false) => {
      const q = query.trim();
      const myReqId = ++reqIdRef.current;
      const isFirstLoad = booksLengthRef.current === 0;

      if (!dateFilterActive && !append) {
        const cached = EXPLORE_CACHE.get(keyForCache);
        if (cached) {
          if (myReqId !== reqIdRef.current) return;
          setBooks(cached.books);
          setTotal(cached.totalPages);
          setResultState(cached.books.length ? "idle" : "no-results");
          setPaginating(false);
          return;
        }
      }

      setErr("");
      if (dateFilterActive) {
        setStage("meta");
        setProbeNow(null);
        setWindowInfo(null);
      } else {
        setResultState(isFirstLoad ? "loading" : "idle");
      }

      let timeoutHit = false;
      const timer = setTimeout(() => {
        timeoutHit = true;
        if (!dateFilterActive && isFirstLoad) setResultState("timeout");
      }, 15000);

      try {
        const res = await searchBooks({
          query: q || "",
          sort,
          page,
          perPage: 45,
          includeTags: activeIncludes,
          excludeTags: activeExcludes,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          sessionKey: `explore::${q || "ALL"}::${incStr}::${excStr}`,
          onProgress: dateFilterActive
            ? (pr: DateSearchProgress) => {
                if (hasProbe(pr)) {
                  const { bounds: b, probe: pv } = pr;
                  setProbeNow({
                    which: pr.which || "start",
                    page: pv.page,
                    headSec: pv.headSec,
                    tailSec: pv.tailSec,
                    lo: b.lo,
                    hi: b.hi,
                    mid: b.mid,
                    decision: b.decision,
                  });
                  return;
                }
                if (pr.phase === "fetch" && pr.window) setWindowInfo(pr.window);
                setStage(pr.phase);
              }
            : undefined,
        });

        clearTimeout(timer);
        if (myReqId !== reqIdRef.current) return;

        if (append && page > 1) {
          setBooks((prev) => {
            const existingIds = new Set(prev.map((b: Book) => b.id));
            const newBooks = res.books.filter((b: Book) => !existingIds.has(b.id));
            const combined = [...prev, ...newBooks];
            return combined;
          });
        } else {
          setBooks(res.books);
          if (page === 1 || !append) {
            EXPLORE_CACHE.set(keyForCache, {
              books: res.books,
              totalPages: res.totalPages,
            });
          }
        }
        setTotal(res.totalPages);

        if (!dateFilterActive) {
          setResultState(res.books.length ? "idle" : "no-results");
        } else {
          setTimeout(() => {
            setStage("done");
            setProbeNow(null);
          }, 200);
        }
      } catch (e: any) {
        clearTimeout(timer);
        if (myReqId !== reqIdRef.current) return;
        setErr(e?.message || String(e));
        if (dateFilterActive) setStage("done");
        else setResultState(timeoutHit ? "timeout" : "error");
      } finally {
        setPaginating(false);
      }
    },
    [
      query,
      sort,
      incStr,
      excStr,
      dateFrom,
      dateTo,
      dateFilterActive,
      activeIncludes,
      activeExcludes,
      infiniteScroll,
    ]
  );

  useEffect(() => {
    if (!isHydrated) return;
    if (skipPageChangeRef.current) {
      skipPageChangeRef.current = false;
      return;
    }
    fetchPage(currentPage, cacheKey, false);
  }, [isHydrated, cacheKey, currentPage, fetchPage]);

  useEffect(() => {
    setQuery(urlQ ?? "");
  }, [urlQ]);

  useEffect(() => {
    setPage(1);
    scrollToTop(scrollRef);
  }, [query, sort, incStr, excStr, dateFrom, dateTo]);

  useEffect(() => {
    if (prevPageRef.current === currentPage) return;
    prevPageRef.current = currentPage;
    if (infiniteScroll) return;
    if (Platform.OS === "web") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToTop(scrollRef));
      });
    } else {
      scrollToTop(scrollRef);
    }
  }, [currentPage, infiniteScroll]);

  const onRefresh = useCallback(async () => {
    if (!isHydrated) return;
    await fetchPage(currentPage, cacheKey);
  }, [isHydrated, currentPage, cacheKey, fetchPage]);

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

  const toggleFav = useCallback(
    (id: number, next: boolean) => {
      setFav((prev) => {
        const cp = new Set(prev);
        next ? cp.add(id) : cp.delete(id);
        AsyncStorage.setItem("bookFavorites", JSON.stringify([...cp]));
        return cp;
      });

      setBooks((prev) => {
        const patched = prev.map((b) =>
          b.id === id
            ? {
                ...b,
                favorites: Math.max(
                  0,
                  (typeof b.favorites === "number" ? b.favorites : 0) +
                    (next ? 1 : -1)
                ),
              }
            : b
        );
        const cached = EXPLORE_CACHE.get(cacheKey);
        if (cached)
          EXPLORE_CACHE.set(cacheKey, {
            books: patched,
            totalPages: cached.totalPages,
          });
        return patched;
      });
    },
    [cacheKey]
  );

  const showNoResults =
    (!dateFilterActive && resultState === "no-results") ||
    (dateFilterActive && !searching && books.length === 0);

  const reason = dateFilterActive
    ? "dates"
    : hasTagFilters
    ? "filters"
    : "general";

  const noResTitle =
    reason === "dates"
      ? t("explore.noResults.title.dates") ||
        "В выбранном диапазоне дат ничего не найдено"
      : reason === "filters"
      ? t("explore.noResults.title.filters") ||
        "По выбранным фильтрам ничего не найдено"
      : query.trim()
      ? (t("explore.noResults.title.query", {
          query: query.trim(),
        }) as string) || `По запросу «${query.trim()}» ничего не найдено`
      : t("explore.noResults.title.default") || "Ничего не найдено";

  const noResSubtitle =
    t("explore.noResults.subtitle") ||
    "Попробуй изменить запрос, снять часть фильтров или расширить диапазон.";

  const noResActions = useMemo(() => {
    const base = [
      {
        label: t("explore.noResults.actions.openFilters") || "Открыть фильтры",
        onPress: () => router.push("/tags"),
      },
      {
        label: t("explore.noResults.actions.fresh") || "Свежие",
        onPress: () => setSort("date"),
      },
      {
        label:
          t("explore.noResults.actions.popularMonth") || "Популярное за месяц",
        onPress: () => setSort("popular-month"),
      },
    ];
    if (reason === "dates")
      return [
        {
          label: t("explore.noResults.actions.resetDates") || "Сбросить даты",
          onPress: clearRange,
        },
        ...base,
      ];
    if (reason === "filters") {
      return [
        {
          label:
            t("explore.noResults.actions.resetFilters") || "Сбросить фильтры",
          onPress: () => {
            clearAllTagFilters?.() ?? router.push("/tags");
          },
        },
        ...base,
      ];
    }
    return [
      {
        label: t("explore.noResults.actions.changeQuery") || "Изменить запрос",
        onPress: () =>
          router.push({
            pathname: "/search",
            params: { query: query.trim() },
          }),
      },
      ...base,
    ];
  }, [router, query, setSort, clearRange, reason, clearAllTagFilters, t]);

  const showListSkeleton =
    (!dateFilterActive && resultState === "loading" && books.length === 0) ||
    (dateFilterActive && books.length === 0 && searching);

  return (
    <View style={styles.container}>
      {dateFilterActive && searching && <DateSearchPanel />}

      {showNoResults && (
        <NoResultsPanel
          title={noResTitle}
          subtitle={noResSubtitle}
          iconName={
            reason === "dates"
              ? "calendar"
              : reason === "filters"
              ? "filter"
              : "search"
          }
          actions={noResActions}
        />
      )}

      {(!dateFilterActive || !searching) && (
        <>
          <BookList
            data={books}
            loading={showListSkeleton}
            refreshing={false}
            onRefresh={onRefresh}
            isFavorite={(id) => favorites.has(id)}
            onToggleFavorite={toggleFav}
            onPress={(id) => {
              const b = books.find((x) => x.id === id);
              router.push({
                pathname: "/book/[id]",
                params: {
                  id: String(id),
                  title: b?.title?.pretty ?? "",
                },
              });
            }}
            gridConfig={{ default: gridConfig }}
            scrollRef={scrollRef}
            onEndReached={
              infiniteScroll && currentPage < totalPages && !isPaginating
                ? () => {
                    setPaginating(true);
                    if (dateFilterActive) {
                      setStage("fetch");
                      setProbeNow(null);
                      setWindowInfo(null);
                    }
                    const nextPage = currentPage + 1;
                    const nextCacheKey = JSON.stringify({
                      q: query.trim(),
                      sort,
                      inc: activeIncludes,
                      exc: activeExcludes,
                      page: nextPage,
                      from: dateFrom
                        ? new Date(dateFrom as any).toISOString().slice(0, 10)
                        : null,
                      to: dateTo ? new Date(dateTo as any).toISOString().slice(0, 10) : null,
                    });
                    skipPageChangeRef.current = true;
                    fetchPage(nextPage, nextCacheKey, true);
                    setPage(nextPage);
                  }
                : undefined
            }
          />
          {!infiniteScroll && (
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              onChange={(p) => {
                setPaginating(true);
                if (dateFilterActive) {
                  setStage("fetch");
                  setProbeNow(null);
                  setWindowInfo(null);
                }
                skipPageChangeRef.current = true;
                const paginationCacheKey = JSON.stringify({
                  q: query.trim(),
                  sort,
                  inc: activeIncludes,
                  exc: activeExcludes,
                  page: p,
                  from: dateFrom
                    ? new Date(dateFrom as any).toISOString().slice(0, 10)
                    : null,
                  to: dateTo ? new Date(dateTo as any).toISOString().slice(0, 10) : null,
                });
                fetchPage(p, paginationCacheKey, false);
                setPage(p);
              }}
              scrollRef={scrollRef}
              hideWhenInfiniteScroll={false}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
