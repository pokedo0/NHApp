import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import {
  Rect as CardRect,
  CharacterCatalogItemDto,
  deleteCharacterCard,
  getCharacterCatalog,
  updateCharacterCard,
} from "@/api/characterCards";
import { TagLite } from "@/components/book/TagBlock";
import EditCharacterCardModal from "@/components/EditCharacterCardModal";
import { useOnlineMe } from "@/hooks/useOnlineMe";
import { useI18n } from "@/lib/i18n/I18nContext";
import { useTheme } from "@/lib/ThemeContext";

type ParodyGroup = {
  parodyName: string | null;
  tags: CharacterTag[];
};

function normalize(str: string): string {
  return str.normalize("NFKC").toLowerCase().trim();
}

type CharacterTag = TagLite & {
  cardId?: number | null;
  cardImageUrl?: string | null;
  cardRect?: CardRect | null;
  cardParodyName?: string | null;
  creatorUserId?: number | null;
  creatorName?: string | null;
  creatorAvatar?: string | null;
  bookExternalId?: number | null;
};

type UserFilterOption = {
  key: string;
  label: string;
  userId: number | null;
  avatarUrl?: string | null;
  count: number;
};

type ViewMode = "collections_grid" | "alphabet_list";

type FlatItem = {
  tag: CharacterTag;
  parodyName: string | null;
};

type RenderFlat = {
  type: "flat";
  items: FlatItem[];
};

type RenderCollections = {
  type: "collections";
  groups: ParodyGroup[];
};

type RenderContent = RenderFlat | RenderCollections;

const GRID_HORIZONTAL_PADDING = 12;
const GRID_GAP = 12;
const CARD_MIN_WIDTH = 160;

export default function CharactersScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const me = useOnlineMe();
  const { width: screenWidth } = useWindowDimensions();

  const gridInnerWidth = Math.max(0, screenWidth - GRID_HORIZONTAL_PADDING * 2);

  const numColumns = Math.max(2, Math.floor(gridInnerWidth / CARD_MIN_WIDTH));

  const totalGapWidth = GRID_GAP * (numColumns - 1);
  const cardWidth =
    numColumns > 0
      ? (gridInnerWidth - totalGapWidth) / numColumns
      : gridInnerWidth;

  const [catalog, setCatalog] = useState<CharacterCatalogItemDto[]>([]);
  const [groups, setGroups] = useState<ParodyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("collections_grid");
  const [authorModalVisible, setAuthorModalVisible] = useState(false);

  const [activeCollectionName, setActiveCollectionName] = useState<
    string | null
  >(null);

  const [editMode, setEditMode] = useState(false);
  const [editingTag, setEditingTag] = useState<{
    tag: CharacterTag;
    parodyName: string | null;
    bookId: number | null;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editParody, setEditParody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [cardAction, setCardAction] = useState<{
    tag: CharacterTag;
    parodyName: string | null;
  } | null>(null);

  const buildGroups = useCallback((items: CharacterCatalogItemDto[]) => {
    const byParody = new Map<string, CharacterTag[]>();

    for (const item of items) {
      const key = item.parodyName ?? "";
      const arr = byParody.get(key) ?? [];
      const rect = item.rect as CardRect | null;

      const rawUserId = (item.userId as any) ?? null;
      const creatorUserId =
        rawUserId !== null && rawUserId !== undefined
          ? Number(rawUserId)
          : null;

      const tag: CharacterTag = {
        type: "character",
        name: item.characterName,
        count: item.cardsCount,
        hasCard: !!item.imageUrl && !!rect,
        cardId: item.cardId ?? null,
        cardImageUrl: item.imageUrl ?? undefined,
        cardParodyName: item.parodyName ?? undefined,
        cardRect: rect ? { ...rect } : undefined,
        creatorUserId,
        creatorName:
          item.userName ?? (creatorUserId ? `User #${creatorUserId}` : null),
        creatorAvatar: creatorUserId
          ? `https://i1.nhentai.net/avatars/${creatorUserId}.png`
          : null,
        bookExternalId: item.bookExternalId ?? null,
      };

      arr.push(tag);
      byParody.set(key, arr);
    }

    const grouped: ParodyGroup[] = Array.from(byParody.entries()).map(
      ([key, tags]) => {
        const sortedTags = [...tags].sort((a, b) => {
          const aHas = !!(a.cardImageUrl && a.cardRect);
          const bHas = !!(b.cardImageUrl && b.cardRect);
          if (aHas !== bHas) return aHas ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        });
        return { parodyName: key || null, tags: sortedTags };
      }
    );

    grouped.sort((a, b) =>
      (a.parodyName ?? "").localeCompare(b.parodyName ?? "", undefined, {
        sensitivity: "base",
      })
    );
    setGroups(grouped);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getCharacterCatalog();
      setCatalog(items);
      buildGroups(items);
      setError(null);
    } catch (err: any) {
      setError(err?.message || t("characters.error.download"));
    } finally {
      setLoading(false);
    }
  }, [buildGroups, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const items = await getCharacterCatalog();
      setCatalog(items);
      buildGroups(items);
      setError(null);
    } finally {
      setRefreshing(false);
    }
  }, [buildGroups]);

  const userOptions = useMemo<UserFilterOption[]>(() => {
    const map = new Map<number, UserFilterOption>();
    let allCount = 0;

    for (const item of catalog) {
      allCount++;

      const rawUserId = (item.userId as any) ?? null;
      const uid =
        rawUserId !== null && rawUserId !== undefined
          ? Number(rawUserId)
          : null;

      if (!uid) continue;

      if (!map.has(uid)) {
        map.set(uid, {
          key: `u-${uid}`,
          label: item.userName ?? `User #${uid}`,
          userId: uid,
          avatarUrl: `https://i1.nhentai.net/avatars/${uid}.png`,
          count: 0,
        });
      }
      map.get(uid)!.count++;
    }

    const opts: UserFilterOption[] = [
      {
        key: "all",
        label: t("characters.filter.allUsers"),
        userId: null,
        count: allCount,
      },
    ];

    const sortedUsers = [...map.values()].sort((a, b) => b.count - a.count);
    return [...opts, ...sortedUsers];
  }, [catalog, t]);

  const currentUserOption =
    userOptions.find((o) => o.userId === selectedUserId) ?? userOptions[0];

  const isSearching = normalize(search).length > 0;

  const filteredGroups = useMemo(() => {
    if (selectedUserId == null) return groups;
    return groups
      .map((g) => ({
        ...g,
        tags: g.tags.filter(
          (t) => (t.creatorUserId ?? null) === selectedUserId
        ),
      }))
      .filter((g) => g.tags.length > 0);
  }, [groups, selectedUserId]);

  const activeCollectionGroup = useMemo(() => {
    if (!activeCollectionName) return null;
    return (
      filteredGroups.find(
        (g) => (g.parodyName ?? "") === activeCollectionName
      ) ?? null
    );
  }, [filteredGroups, activeCollectionName]);

  const renderContent: RenderContent = useMemo(() => {
    if (isSearching) {
      const q = normalize(search);
      const res: FlatItem[] = [];
      for (const g of filteredGroups) {
        for (const t of g.tags) {
          if (normalize(t.name).includes(q)) {
            res.push({ tag: t, parodyName: g.parodyName });
          }
        }
      }
      res.sort((a, b) =>
        a.tag.name.localeCompare(b.tag.name, undefined, {
          sensitivity: "base",
        })
      );
      return { type: "flat", items: res };
    }

    if (activeCollectionName !== null && activeCollectionGroup) {
      const items: FlatItem[] = activeCollectionGroup.tags.map((t) => ({
        tag: t,
        parodyName: activeCollectionGroup.parodyName,
      }));
      return { type: "flat", items };
    }

    if (viewMode === "alphabet_list") {
      const allTags: FlatItem[] = [];
      for (const g of filteredGroups) {
        for (const t of g.tags) {
          allTags.push({ tag: t, parodyName: g.parodyName });
        }
      }
      allTags.sort((a, b) =>
        a.tag.name.localeCompare(b.tag.name, undefined, {
          sensitivity: "base",
        })
      );
      return { type: "flat", items: allTags };
    }

    return { type: "collections", groups: filteredGroups };
  }, [
    filteredGroups,
    isSearching,
    search,
    viewMode,
    activeCollectionName,
    activeCollectionGroup,
  ]);

  const canEditTag = useCallback(
    (tag: CharacterTag) => {
      if (!me) return false;
      return (tag.creatorUserId ?? null) === me.id;
    },
    [me]
  );

  const handleCharacterPress = (
    tag: CharacterTag,
    parodyName: string | null
  ) => {
    if (editMode && canEditTag(tag) && tag.cardId) {
      setEditingTag({
        tag,
        parodyName,
        bookId: tag.bookExternalId ?? null,
      });
      setEditName(tag.name);
      setEditParody(tag.cardParodyName ?? parodyName ?? "");
      setEditError(null);
    } else if (!editMode) {
      if (tag.bookExternalId) {
        setCardAction({ tag, parodyName });
      } else {
        router.push({
          pathname: "/explore",
          params: { query: tag.name, solo: "1" },
        });
      }
    }
  };

  const handleCollectionPress = (group: ParodyGroup) => {
    setActiveCollectionName(group.parodyName ?? "");
  };

  const handleBackToCollections = () => {
    setActiveCollectionName(null);
  };

  const handleCardActionClose = () => {
    setCardAction(null);
  };

  const handleCardActionSearch = () => {
    if (!cardAction) return;
    router.push({
      pathname: "/explore",
      params: { query: cardAction.tag.name, solo: "1" },
    });
    setCardAction(null);
  };

  const handleCardActionOpenBook = () => {
    if (!cardAction?.tag.bookExternalId) return;
    router.push(`/book/${cardAction.tag.bookExternalId}`);
    setCardAction(null);
  };

  const { bg, page, title, sub, accent, txt, tagBg } = colors;
  const initialLoading = loading && !refreshing && catalog.length === 0;

  const isEmpty =
    renderContent.type === "flat"
      ? renderContent.items.length === 0
      : renderContent.groups.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: bg, borderBottomColor: page },
        ]}
      >
        <View
          style={[styles.searchContainer, { backgroundColor: colors.searchBg }]}
        >
          <Feather
            name="search"
            size={16}
            color={sub}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: txt }]}
            placeholder={t("characters.searchPlaceholder")}
            placeholderTextColor={sub}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={sub} />
            </Pressable>
          )}
        </View>

        <View style={styles.controlsRow}>
          {activeCollectionName !== null && !isSearching ? (
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: page }]}
              onPress={handleBackToCollections}
            >
              <Feather name="arrow-left" size={16} color={txt} />
              <Text style={[styles.backBtnText, { color: txt }]}>
                {t("characters.backToCollections")}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.toggleContainer, { backgroundColor: page }]}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  viewMode === "collections_grid" && {
                    backgroundColor: accent,
                  },
                ]}
                onPress={() => setViewMode("collections_grid")}
              >
                <Feather
                  name="grid"
                  size={14}
                  color={viewMode === "collections_grid" ? "#fff" : sub}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  viewMode === "alphabet_list" && {
                    backgroundColor: accent,
                  },
                ]}
                onPress={() => setViewMode("alphabet_list")}
              >
                <Feather
                  name="list"
                  size={14}
                  color={viewMode === "alphabet_list" ? "#fff" : sub}
                />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: selectedUserId ? accent : page,
              },
            ]}
            onPress={() => setAuthorModalVisible(true)}
          >
            {currentUserOption.avatarUrl ? (
              <ExpoImage
                source={{ uri: currentUserOption.avatarUrl }}
                style={styles.chipAvatar}
              />
            ) : (
              <View style={styles.chipAvatar}>
                <Feather
                  name="user"
                  size={14}
                  color={selectedUserId ? "#fff" : txt}
                />
              </View>
            )}
            <Text
              style={[
                styles.chipText,
                { color: selectedUserId ? "#fff" : txt },
              ]}
              numberOfLines={1}
            >
              {currentUserOption.label}
            </Text>
            <Feather
              name="chevron-down"
              size={12}
              color={selectedUserId ? "#fff" : sub}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: editMode ? "#ff4757" : page,
              },
            ]}
            onPress={() => setEditMode(!editMode)}
          >
            <Feather name="edit-3" size={16} color={editMode ? "#fff" : txt} />
          </TouchableOpacity>
        </View>

        {activeCollectionName !== null && !isSearching && (
          <View style={styles.subHeader}>
            <Text style={[styles.collectionTitleBig, { color: title }]}>
              {activeCollectionName || t("characters.collection.untitled")}
            </Text>
            <Text style={{ color: sub, fontSize: 12 }}>
              {activeCollectionGroup
                ? t("characters.charactersCount", {
                    count: activeCollectionGroup.tags.length,
                  })
                : ""}
            </Text>
          </View>
        )}
      </View>

      {initialLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: GRID_HORIZONTAL_PADDING },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent}
            />
          }
        >
          {error && <Text style={styles.errorText}>{error}</Text>}
          {isEmpty && !error && (
            <View style={styles.centerBox}>
              <Feather
                name="inbox"
                size={48}
                color={sub}
                style={{
                  opacity: 0.5,
                  marginBottom: 10,
                }}
              />
              <Text style={{ color: sub }}>{t("characters.empty")}</Text>
            </View>
          )}

          <View style={styles.gridContainer}>
            {renderContent.type === "collections" &&
              renderContent.groups.map((group) => (
                <CollectionFolderCard
                  key={group.parodyName ?? "unk"}
                  group={group}
                  width={cardWidth}
                  colors={colors}
                  onPress={() => handleCollectionPress(group)}
                  t={t}
                />
              ))}

            {renderContent.type === "flat" &&
              renderContent.items.map(({ tag, parodyName }) => (
                <CharacterCard
                  key={`${parodyName}:${tag.name}`}
                  tag={tag}
                  parodyName={parodyName}
                  width={cardWidth}
                  colors={colors}
                  editMode={editMode}
                  canEdit={canEditTag(tag)}
                  onPress={() => handleCharacterPress(tag, parodyName)}
                  t={t}
                />
              ))}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={authorModalVisible}
        statusBarTranslucent
        transparent
        animationType="fade"
        onRequestClose={() => setAuthorModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: page }]}>
              <Text style={[styles.modalTitle, { color: title }]}>
                {t("characters.selectAuthorTitle")}
              </Text>
              <TouchableOpacity onPress={() => setAuthorModalVisible(false)}>
                <Feather name="x" size={24} color={txt} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={userOptions}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.authorItem,
                    { backgroundColor: page },
                    selectedUserId === item.userId && {
                      borderColor: accent,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    setSelectedUserId(item.userId);
                    setAuthorModalVisible(false);
                  }}
                >
                  {item.avatarUrl ? (
                    <ExpoImage
                      source={{ uri: item.avatarUrl }}
                      style={styles.authorAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.authorAvatar,
                        {
                          backgroundColor: tagBg,
                          justifyContent: "center",
                          alignItems: "center",
                        },
                      ]}
                    >
                      <Feather name="user" size={16} color={sub} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.authorName, { color: txt }]}>
                      {item.label}
                    </Text>
                    <Text
                      style={{
                        color: sub,
                        fontSize: 11,
                      }}
                    >
                      {t("characters.cardsCount", { count: item.count })}
                    </Text>
                  </View>
                  {selectedUserId === item.userId && (
                    <Feather name="check" size={18} color={accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!cardAction}
        statusBarTranslucent
        transparent
        animationType="fade"
        onRequestClose={handleCardActionClose}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={handleCardActionClose}
          />
          <View
            style={[
              styles.cardActionSheet,
              { backgroundColor: bg, borderTopColor: colors.page },
            ]}
          >
            <View
              style={[
                styles.cardActionHeader,
                { borderBottomColor: colors.page },
              ]}
            >
              <Text style={[styles.cardActionTitle, { color: title }]}>
                {t("characters.cardActions.title")}
              </Text>
              {cardAction?.tag.name ? (
                <Text
                  style={[styles.cardActionSubtitle, { color: colors.sub }]}
                  numberOfLines={1}
                >
                  {cardAction.tag.name}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.cardActionBtn, { borderBottomColor: colors.page }]}
              onPress={handleCardActionSearch}
            >
              <Feather name="search" size={18} color={accent} />
              <Text style={[styles.cardActionText, { color: txt }]}>
                {t("characters.cardActions.searchByCharacter")}
              </Text>
            </TouchableOpacity>

            {cardAction?.tag.bookExternalId && (
              <TouchableOpacity
                style={[
                  styles.cardActionBtn,
                  { borderBottomColor: colors.page },
                ]}
                onPress={handleCardActionOpenBook}
              >
                <Feather name="book-open" size={18} color={accent} />
                <Text style={[styles.cardActionText, { color: txt }]}>
                  {t("characters.cardActions.openBook")}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cardActionCancel}
              onPress={handleCardActionClose}
            >
              <Text
                style={[styles.cardActionCancelText, { color: colors.sub }]}
              >
                {t("characters.cardActions.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <EditCharacterCardModal
        visible={!!editingTag}
        tag={editingTag?.tag ?? null}
        parodyName={editingTag?.parodyName ?? null}
        bookId={editingTag?.bookId ?? null}
        name={editName}
        setName={setEditName}
        parody={editParody}
        setParody={setEditParody}
        saving={editSaving}
        error={editError}
        canDelete={!!editingTag?.tag.cardId && canEditTag(editingTag.tag)}
        onCancel={() => setEditingTag(null)}
        onSave={async (rect) => {
          await handleSaveEdit(rect ?? undefined);
        }}
        onDelete={async () => {
          await handleDelete();
        }}
      />
    </View>
  );

  async function handleSaveEdit(newRect?: CardRect) {
    if (!editingTag?.tag.cardId) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError(t("characters.validation.nameRequired"));
      return;
    }

    setEditSaving(true);
    try {
      await updateCharacterCard(editingTag.tag.cardId!, {
        characterName: trimmedName,
        parodyName: editParody.trim() || null,
        imageUrl: editingTag.tag.cardImageUrl ?? "",
        rect: newRect ??
          editingTag.tag.cardRect ?? {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        userId: me?.id!,
      });
      await loadData();
      setEditingTag(null);
      setEditError(null);
    } catch (e: any) {
      setEditError(e?.message || t("characters.error.save"));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingTag?.tag.cardId) return;
    setEditSaving(true);
    try {
      await deleteCharacterCard(editingTag.tag.cardId!, me?.id!);
      await loadData();
      setEditingTag(null);
      setEditError(null);
    } catch (e: any) {
      setEditError(e?.message || t("characters.error.delete"));
    } finally {
      setEditSaving(false);
    }
  }
}

type CroppedImageProps = {
  uri: string;
  rect?: CardRect | null;
  style?: any;
};

const CroppedImage: React.FC<CroppedImageProps> = ({ uri, rect, style }) => {
  const [size, setSize] = useState({ width: 5000, height: 5000 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  const hasRect =
    !!rect &&
    size.width > 0 &&
    size.height > 0 &&
    rect.width > 0 &&
    rect.height > 0;

  let imageStyle: any = {
    width: "100%",
    height: "100%",
  };

  if (hasRect && rect) {
    const displayWidth = size.width / rect.width;
    const displayHeight = size.height / rect.height;
    const offsetX = -rect.x * displayWidth;
    const offsetY = -rect.y * displayHeight;

    imageStyle = {
      width: displayWidth,
      height: displayHeight,
      position: "absolute",
      left: offsetX,
      top: offsetY,
    };
  }

  return (
    <View
      style={[
        {
          width: "100%",
          height: "100%",
          overflow: "hidden",
        },
        style,
      ]}
      onLayout={onLayout}
    >
      <ExpoImage
        source={{ uri }}
        style={imageStyle}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="low"
      />
    </View>
  );
};

const CollectionFolderCard = React.memo(
  ({
    group,
    width,
    colors,
    onPress,
    t,
  }: {
    group: ParodyGroup;
    width: number;
    colors: any;
    onPress: () => void;
    t: (key: string, params?: Record<string, any>) => string;
  }) => {
    const previews = group.tags.filter((t) => t.cardImageUrl).slice(0, 4);
    const collageHeight = width / 0.7;

    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.folderCard, { width, backgroundColor: colors.page }]}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.collageContainer,
            {
              width: "100%",
              height: collageHeight,
              backgroundColor: colors.cardBg,
            },
          ]}
        >
          {previews.length > 0 ? (
            <View style={styles.collageGrid}>
              {[0, 1, 2, 3].map((i) => {
                const tag = previews[i];
                return (
                  <View
                    key={i}
                    style={{
                      width: "50%",
                      padding: 1,
                    }}
                  >
                    <View
                      style={{
                        width: "100%",
                        aspectRatio: 1.4 / 2,
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      {tag ? (
                        <CroppedImage
                          uri={tag.cardImageUrl!}
                          rect={tag.cardRect ?? null}
                        />
                      ) : (
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: colors.bg,
                            opacity: 0.3,
                          }}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyFolder}>
              <Feather name="folder" size={32} color={colors.sub} />
            </View>
          )}

          <View style={styles.folderBadge}>
            <Text style={styles.folderBadgeText}>{group.tags.length}</Text>
          </View>
        </View>

        <View style={styles.folderFooter}>
          <Text
            style={[styles.folderTitle, { color: colors.txt }]}
            numberOfLines={2}
          >
            {group.parodyName || t("characters.collection.untitled")}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

type CharacterCardProps = {
  tag: CharacterTag;
  parodyName: string | null;
  width: number;
  colors: any;
  editMode: boolean;
  canEdit: boolean;
  onPress: () => void;
  t: (key: string, params?: Record<string, any>) => string;
};

const CharacterCard = React.memo(
  ({
    tag,
    width,
    colors,
    editMode,
    canEdit,
    onPress,
    t,
  }: CharacterCardProps) => {
    const hasImage = !!tag.cardImageUrl;
    const placeholderInitial = (tag.name || "?").trim().charAt(0) || "?";

    const creatorName =
      tag.creatorName ??
      (tag.creatorUserId ? `User #${tag.creatorUserId}` : null);
    const creatorAvatar = tag.creatorAvatar ?? null;

    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.charCard,
          { width, backgroundColor: colors.page },
          pressed && {
            opacity: 0.9,
            transform: [{ scale: 0.98 }],
          },
        ]}
      >
        <View style={styles.charImageWrap}>
          {hasImage ? (
            <CroppedImage uri={tag.cardImageUrl!} rect={tag.cardRect ?? null} />
          ) : (
            <View
              style={[styles.emptyFolder, { backgroundColor: colors.tagBg }]}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: colors.sub,
                }}
              >
                {placeholderInitial}
              </Text>
            </View>
          )}

          {editMode && canEdit && (
            <View style={styles.editBadge}>
              <Feather name="edit-2" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.charFooter}>
          <Text
            style={[styles.charName, { color: colors.txt }]}
            numberOfLines={1}
          >
            {tag.name}
          </Text>

          {creatorName && (
            <View style={styles.creatorRow}>
              {creatorAvatar ? (
                <ExpoImage
                  source={{ uri: creatorAvatar }}
                  style={styles.creatorAvatar}
                  contentFit="cover"
                  cachePolicy="none"
                />
              ) : (
                <View
                  style={[
                    styles.creatorAvatarFallback,
                    { backgroundColor: colors.tagBg },
                  ]}
                >
                  <Feather
                    name="user"
                    size={11}
                    color={colors.metaText ?? colors.txt}
                  />
                </View>
              )}
              <Text
                style={[styles.creatorName, { color: colors.sub }]}
                numberOfLines={1}
              >
                {creatorName}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    marginBottom: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, height: "100%" },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
    height: 36,
  },
  toggleContainer: {
    flexDirection: "row",
    borderRadius: 18,
    padding: 2,
    height: 32,
  },
  toggleBtn: {
    width: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 16,
    maxWidth: 180,
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 100,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    gap: 6,
  },
  backBtnText: { fontSize: 13, fontWeight: "600" },
  subHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  collectionTitleBig: {
    fontSize: 20,
    fontWeight: "800",
  },
  scrollContent: { paddingTop: 12, paddingBottom: 40 },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
  errorText: {
    color: "#ff4757",
    textAlign: "center",
    margin: 20,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    justifyContent: "flex-start",
  },
  folderCard: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 4,
  },
  collageContainer: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  collageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    height: "100%",
  },
  emptyFolder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  folderBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  folderBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  folderFooter: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  folderTitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  charCard: {
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 4,
  },
  charImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 1.4 / 2,
    overflow: "hidden",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: "#000",
  },
  charFooter: {
    padding: 6,
    justifyContent: "center",
  },
  charName: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  editBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#ff4757",
    padding: 4,
    borderRadius: 8,
  },
  creatorRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  creatorAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  creatorAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  creatorName: {
    fontSize: 11,
    maxWidth: 120,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
  authorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  authorName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },

  cardActionSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  cardActionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cardActionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardActionSubtitle: {
    fontSize: 13,
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  cardActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardActionCancel: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  cardActionCancelText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
});
