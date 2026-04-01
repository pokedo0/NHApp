import type { GalleryComment } from "@/api/nhappApi/types";
import { getGalleryComments, getMe, deleteComment } from "@/api/v2";
import type { Comment as ApiComment } from "@/api/v2";
import { commentToGalleryComment } from "@/api/v2/compat";
import CommentCard from "@/components/CommentCard";
import CommentComposer from "@/components/CommentComposer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const s = String(u).trim();
  if (!s) return undefined;
  if (/^https?:\/\//.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return "https://nhentai.net" + s;
  return s;
}

export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const galleryId = Number(id);
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useI18n();

  // Current user
  const [myUserId, setMyUserId] = useState<number | undefined>();
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | undefined>();
  const [myUsername, setMyUsername] = useState<string | undefined>();

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
    return () => { alive = false; };
  }, []);

  // Comments
  const [allComments, setAllComments] = useState<GalleryComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const [localNew, setLocalNew] = useState<GalleryComment[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  const fetchComments = useCallback(async () => {
    if (!galleryId || galleryId <= 0) return;
    try {
      setLoading(true);
      const cs = await getGalleryComments(galleryId);
      setAllComments(cs.map(commentToGalleryComment));
      setVisibleCount(20);
    } catch {
      setAllComments([]);
    } finally {
      setLoading(false);
    }
  }, [galleryId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // Sync avatar for locally added comments
  useEffect(() => {
    if (!myAvatarUrl && !myUsername && !myUserId) return;
    setLocalNew((prev) =>
      prev.map((c) => {
        const hasAvatar = (c as any).avatar || (c.poster as any)?.avatar_url || (c.poster as any)?.avatar;
        if (!hasAvatar) {
          const poster = {
            ...(c.poster as any),
            id: (c.poster as any)?.id ?? myUserId,
            username: (c.poster as any)?.username ?? myUsername,
            avatar_url: absUrl((c.poster as any)?.avatar_url) ?? absUrl(myAvatarUrl),
          };
          return { ...c, poster, avatar: absUrl((c as any).avatar) ?? absUrl(myAvatarUrl) } as any;
        }
        return c;
      })
    );
  }, [myAvatarUrl, myUsername, myUserId]);

  const makeKey = (c: GalleryComment) => {
    const id = c.id as number | undefined;
    if (id) return `id:${id}`;
    const uid = (c.poster as any)?.id ?? (c.poster as any)?.username ?? "u";
    const ts = typeof c.post_date === "number" ? c.post_date : Date.parse(String(c.post_date ?? "")) || 0;
    return `tmp:${uid}|${ts}|${(c.body || "").slice(0, 48)}`;
  };

  const mergedComments = useMemo(() => {
    const seen = new Set<string>();
    const out: GalleryComment[] = [];
    for (const c of [...localNew, ...allComments]) {
      if (!c) continue;
      const key = makeKey(c);
      if (seen.has(key)) continue;
      const cid = c.id as number | undefined;
      if (cid && hiddenIds.has(cid)) continue;
      out.push(c);
      seen.add(key);
    }
    return out;
  }, [localNew, allComments, hiddenIds]);

  const totalCount = mergedComments.length;
  const visibleComments = mergedComments.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;

  const toGalleryComment = (c: ApiComment): GalleryComment => {
    const poster = (c.poster as any) || {};
    const avatar = absUrl(poster.avatar_url || poster.avatar) || absUrl(myAvatarUrl) || "";
    const username = poster.username || myUsername || "user";
    const uid = poster.id ?? myUserId;
    return {
      id: c.id,
      gallery_id: c.gallery_id,
      body: c.body,
      post_date: c.post_date,
      poster: {
        ...poster,
        id: uid,
        username,
        avatar_url: avatar,
        slug: (poster.slug || poster.username || username || "user").toLowerCase(),
      } as any,
      avatar,
    };
  };

  const handleSubmitted = async (c: ApiComment) => {
    setLocalNew((prev) => [toGalleryComment(c), ...prev]);
    setVisibleCount((n) => Math.max(n, 1));
    try { await fetchComments(); } catch {}
  };

  const handleDelete = async (cid?: number) => {
    if (!cid) return;
    await deleteComment(cid);
    setHiddenIds((prev) => { const next = new Set(prev); next.add(cid); return next; });
    try { await fetchComments(); } catch {}
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item: c }: { item: GalleryComment }) => {
      const pid = Number(c?.poster?.id);
      const isMine =
        Number.isFinite(pid) && Number.isFinite(myUserId as number) && pid === myUserId;
      return (
        <CommentCard
          key={c.id ?? `${c.post_date}-${c.poster?.username ?? "u"}`}
          id={c.id}
          body={c.body}
          post_date={c.post_date}
          poster={c.poster as any}
          avatar={(c as any).avatar}
          highlight={isMine}
          mineLabel={isMine ? t("comments.youComment") : undefined}
          onPressName={() => {
            const posterId = c?.poster?.id;
            if (!posterId) return;
            const slug = (
              (c.poster as any).slug || (c.poster as any).username || "user"
            ).toLowerCase();
            router.push({ pathname: "/profile/[id]/[slug]", params: { id: String(posterId), slug } });
          }}
          onDelete={handleDelete}
        />
      );
    },
    [myUserId, t, router]
  );

  const ListHeader = useMemo(() => {
    if (!myUserId) return null;
    return (
      <View style={{ paddingBottom: 16 }}>
        <CommentComposer
          galleryId={galleryId}
          placeholder={t("comments.writeComment")}
          onSubmitted={handleSubmitted}
        />
      </View>
    );
  }, [myUserId, galleryId, t]);

  const ListFooter = useMemo(() => {
    if (!hasMore) return <View style={{ height: 32 }} />;
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <Pressable
          onPress={() => setVisibleCount((n) => Math.min(n + 20, totalCount))}
          style={[s.showMoreBtn, { borderColor: colors.accent }]}
          android_ripple={{ color: `${colors.accent}22`, borderless: false, foreground: true }}
        >
          <Text style={[s.showMoreTxt, { color: colors.accent }]}>
            {t("showMore", { count: Math.min(20, totalCount - visibleCount) })}
          </Text>
        </Pressable>
      </View>
    );
  }, [hasMore, totalCount, visibleCount, colors.accent, t]);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: colors.tagBg, backgroundColor: colors.bg }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.txt} />
        </Pressable>
        <Text style={[s.topTitle, { color: colors.txt }]} numberOfLines={1}>
          {t("comments.title")} ({totalCount})
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <LoadingSpinner fullScreen size="large" color={colors.accent} />
      ) : (
        <FlatList
          data={visibleComments}
          keyExtractor={(c) =>
            String(c.id ?? `${c.post_date}-${c.poster?.username ?? "u"}`)
          }
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="message-circle" size={48} color={colors.metaText} />
              <Text style={[s.emptyTxt, { color: colors.metaText }]}>No comments yet</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 8 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "700" },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  showMoreBtn: {
    borderWidth: 2,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  showMoreTxt: { fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },

  emptyWrap: {
    paddingTop: 80,
    alignItems: "center",
    gap: 14,
  },
  emptyTxt: { fontSize: 16, fontWeight: "500" },
});
