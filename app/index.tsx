import {
  Book,
  DateSearchPhase,
  DateSearchProgress,
  searchBooks,
} from "@/api/nhentai";
import BookList from "@/components/BookList";
import NoResultsPanel from "@/components/NoResultsPanel";
import PaginationBar from "@/components/PaginationBar";
import WhatsNewModal from "@/components/WhatsNewModal";
import { useDateRange } from "@/context/DateRangeContext";
import { useSort } from "@/context/SortContext";
import { useFilterTags } from "@/context/TagFilterContext";
import { useGridConfig } from "@/hooks/useGridConfig";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";
import { INFINITE_SCROLL_KEY } from "@/components/settings/keys";
import { scrollToTop } from "@/utils/scrollToTop";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

type CacheEntry = { books: Book[]; totalPages: number; ts: number };
const EXPLORE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

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

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { query: rawQ, solo: rawSolo } = useLocalSearchParams<{
    query?: string | string[];
    solo?: string | string[];
  }>();
  const urlQ = Array.isArray(rawQ) ? rawQ[0] : rawQ;
  const solo = Array.isArray(rawSolo) ? rawSolo[0] : rawSolo;
  const { t } = useI18n();

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

  const searching = dateFilterActive && stage !== "idle" && stage !== "done";
  const gridConfig = useGridConfig();
  const reqIdRef = useRef(0);
  const skipPageChangeRef = useRef(false);
  const booksLengthRef = useRef(books.length);

  const { update, checkUpdate } = useUpdateCheck();
  const [showNotes, setShowNotes] = useState(false);

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
        ? t("explore.dateSearch.dirRight")
        : probeNow.decision === "left"
        ? t("explore.dateSearch.dirLeft")
        : probeNow.decision === "hit"
        ? t("explore.dateSearch.dirHit")
        : "";
    const head = fmt(probeNow.headSec);
    const tail = fmt(probeNow.tailSec);
    const whichLabel =
      probeNow.which === "start"
        ? t("explore.dateSearch.whichStart")
        : t("explore.dateSearch.whichEnd");
    return t("explore.dateSearch.probeSubtitle", {
      which: whichLabel,
      page: probeNow.page,
      head,
      tail,
      dir,
    });
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

    const titleKey =
      stage === "meta"
        ? t("explore.dateSearch.title.meta")
        : stage === "range:start"
        ? t("explore.dateSearch.title.rangeStart")
        : stage === "range:end"
        ? t("explore.dateSearch.title.rangeEnd")
        : stage === "fetch"
        ? t("explore.dateSearch.title.fetch")
        : stage === "done"
        ? t("explore.dateSearch.title.done")
        : t("explore.dateSearch.title.loading");

    const title = t(titleKey);

    return (
      <View
        style={{
          backgroundColor: colors.accent + "10",
          borderBottomColor: colors.page,
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
              <Text style={{ color: colors.txt, opacity: 0.8, marginTop: 2 }}>
                {probeSubtitle}
              </Text>
            )}
            {windowInfo && stage === "fetch" && (
              <Text style={{ color: colors.txt, opacity: 0.8, marginTop: 2 }}>
                {t("explore.dateSearch.windowInfo", {
                  start: windowInfo.startIndex,
                  end: windowInfo.endIndex,
                  total: windowInfo.total,
                })}
              </Text>
            )}
          </View>
          <Ring progress={pct} />
        </View>
      </View>
    );
  };

  const UpdateBanner = () => {
    if (!update) return null;
    return (
      <View
        style={{
          backgroundColor: colors.accent + "10",
          borderBottomColor: colors.page,
        }}
      >
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.txt, fontWeight: "700" }}>
              {t("NewUpdate")} {update.versionName}
            </Text>
            {!!update.notes?.trim() && (
              <TouchableOpacity onPress={() => setShowNotes(true)}>
                <Text
                  style={{
                    color: colors.txt,
                    opacity: 0.8,
                    marginTop: 2,
                    textDecorationLine: "underline",
                  }}
                  numberOfLines={1}
                >
                  {t("whatsNewUpdate")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                "https://github.com/e18lab/NHAppAndroid/releases/latest"
              )
            }
            style={[
              styles.ctaBtn,
              {
                backgroundColor: colors.accent + "33",
                borderColor: colors.accent,
              },
            ]}
          >
            <Text style={{ color: colors.accent, fontWeight: "700" }}>
              {t("downloadUpdate")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  useEffect(() => {
    booksLengthRef.current = books.length;
  }, [books.length]);

  const fetchPage = useCallback(
    async (page: number, keyForCache: string, force = false, swr = false, append = false) => {
      const q = query.trim();
      const myReqId = ++reqIdRef.current;
      const isFirstLoad = booksLengthRef.current === 0;

      if (!dateFilterActive && !force && !append) {
        const cached = EXPLORE_CACHE.get(keyForCache);
        const freshEnough =
          cached &&
          (page !== 1 || sort !== "date"
            ? true
            : Date.now() - cached.ts < CACHE_TTL_MS);

        if (cached && (freshEnough || swr)) {
          setBooks(cached.books);
          setTotal(cached.totalPages);
          setResultState(cached.books.length ? "idle" : "no-results");
          if (!swr && freshEnough) {
            setPaginating(false);
            return;
          }
        }
      }

      setErr("");
      if (dateFilterActive) {
        setStage("meta");
        setProbeNow(null);
        setWindowInfo(null);
      } else if (isFirstLoad && !swr) {
        setResultState("loading");
      }

      let timeoutHit = false;
      const timer = setTimeout(() => {
        timeoutHit = true;
        if (!dateFilterActive && (isFirstLoad || swr))
          setResultState("timeout");
      }, 15000);

      try {
        const res = await (searchBooks as any)({
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
          force: force || (page === 1 && sort === "date"),
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
              ts: Date.now(),
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
    const wantFresh = !dateFilterActive && currentPage === 1 && sort === "date";
    fetchPage(currentPage, cacheKey, wantFresh, wantFresh, false);
  }, [isHydrated, cacheKey, currentPage, dateFilterActive, sort, fetchPage]);

  useEffect(() => setQuery(urlQ ?? ""), [urlQ]);
  useEffect(() => {
    setPage(1);
    scrollToTop(scrollRef);
  }, [query, sort, incStr, excStr, dateFrom, dateTo]);

  const onRefresh = useCallback(async () => {
    if (!isHydrated) return;
    await fetchPage(currentPage, cacheKey, true, false);
    checkUpdate();
  }, [isHydrated, currentPage, cacheKey, fetchPage, checkUpdate]);

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
            ts: cached.ts,
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
      ? t("explore.noResults.title.dates")
      : reason === "filters"
      ? t("explore.noResults.title.filters")
      : query.trim()
      ? t("explore.noResults.title.query", { query: query.trim() })
      : t("explore.noResults.title.general");

  const noResSubtitle = t("explore.noResults.subtitle");

  const noResActions = useMemo(() => {
    const base = [
      {
        label: t("explore.noResults.actions.openFilters"),
        onPress: () => router.push("/tags"),
      },
      {
        label: t("explore.noResults.actions.fresh"),
        onPress: () => setSort("date"),
      },
      {
        label: t("explore.noResults.actions.popularMonth"),
        onPress: () => setSort("popular-month"),
      },
    ];
    if (reason === "dates")
      return [
        {
          label: t("explore.noResults.actions.resetDates"),
          onPress: clearRange,
        },
        ...base,
      ];
    if (reason === "filters") {
      return [
        {
          label: t("explore.noResults.actions.resetFilters"),
          onPress: () => {
            clearAllTagFilters?.() ?? router.push("/tags");
          },
        },
        ...base,
      ];
    }
    return [
      {
        label: t("explore.noResults.actions.changeQuery"),
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
      <UpdateBanner />
      <WhatsNewModal
        visible={!!update && showNotes}
        onClose={() => setShowNotes(false)}
        notes={update?.notes ?? ""}
      />

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
                params: { id: String(id), title: b?.title?.pretty ?? "" },
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
                    fetchPage(nextPage, nextCacheKey, false, false, true);
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
                fetchPage(p, paginationCacheKey, false, false, false);
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
  ctaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
