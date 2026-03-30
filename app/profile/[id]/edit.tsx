import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe, getUserProfile, updateProfile, uploadAvatar } from "@/api/v2";
import { resolveImageUrl } from "@/api/v2/config";
import { isElectron, showOpenDialog } from "@/electron/bridge";

interface ProfileEditFormData {
  username: string;
  email: string;
  about: string;
  favorite_tags: string;
  old_password?: string;
  new_password1?: string;
  new_password2?: string;
}
import { useTheme } from "@/lib/ThemeContext";
import { useI18n } from "@/lib/i18n/I18nContext";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

const Skeleton = ({ style }: { style?: any }) => {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ backgroundColor: "#FFFFFF14", borderRadius: 10 }, style, { opacity }]}
    />
  );
};

export default function ProfileEditScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, slug, avatarUrl } = useLocalSearchParams<{ id: string; slug?: string | string[]; avatarUrl?: string }>();
  const rawId = Array.isArray(id) ? id[0] : id;
  const rawSlug = Array.isArray(slug) ? slug[0] : slug;
  const userId = rawId != null && rawId !== "" ? String(rawId).trim() : "";
  const slugStr = rawSlug != null && rawSlug !== "" ? String(rawSlug).trim() : "";
  const initialAvatarUrl = (typeof avatarUrl === "string" && avatarUrl.trim()) ? avatarUrl.trim() : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileEditFormData | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [currentAvatarUri, setCurrentAvatarUri] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const ui = {
    bg: colors.bg,
    card: (colors as any).surfaceElevated ?? "#1a1d22",
    text: (colors as any).title ?? "#e6e7e9",
    sub: (colors as any).metaText ?? "#9ca3af",
    border: "#ffffff10",
    inputBg: "#ffffff08",
    accent: colors.accent ?? "#3b82f6",
    danger: "#ef4444",
    chipBg: "#ffffff0e",
    successBg: (colors.accent ?? "#3b82f6") + "18",
  };

  const loadForm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      // about & favorite_tags are not in /user response — fetch from public profile
      let about = "";
      let favorite_tags = "";
      try {
        const pub = await getUserProfile(me.id, me.slug);
        about = pub.about ?? "";
        favorite_tags = pub.favorite_tags ?? "";
      } catch {}
      setForm({
        username: me.username ?? "",
        email: me.email ?? "",
        about,
        favorite_tags,
        old_password: "",
        new_password1: "",
        new_password2: "",
      });
      // Show current avatar from API (resolve relative path)
      if (me.avatar_url && !initialAvatarUrl) {
        setCurrentAvatarUri(resolveImageUrl(me.avatar_url));
      }
      setRemoveAvatar(false);
    } catch (e: any) {
      setError(
        e?.status === 401
          ? t("profile.edit.notLoggedIn") || "You are not logged in. Please log in first."
          : e?.message || "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, [t, initialAvatarUrl]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const updateForm = useCallback(
    (updates: Partial<ProfileEditFormData>) => {
      setForm((prev) => (prev ? { ...prev, ...updates } : null));
    },
    []
  );

  const pickImage = useCallback(async () => {
    if (isElectron()) {
      let defaultPath: string | undefined;
      try {
        defaultPath = (await (window as any).electron?.getPath?.("pictures")) ?? undefined;
      } catch {
        defaultPath = undefined;
      }
      const result = await showOpenDialog({
        title: t("profile.edit.changeAvatar"),
        ...(defaultPath ? { defaultPath } : {}),
        filters: [
          { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
        ],
        properties: ["openFile"],
      });
      if (!result?.canceled && result?.filePaths?.[0]) {
        const filePath = result.filePaths[0];
        setAvatarPath(filePath);
        setRemoveAvatar(false);
        const dataUrlResult = await (window as any).electron?.getFileAsDataUrl?.(filePath);
        if (dataUrlResult?.success && dataUrlResult?.dataUrl) {
          setCurrentAvatarUri(dataUrlResult.dataUrl);
        } else {
          setCurrentAvatarUri(null);
        }
      }
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("profile.edit.permissionTitle") || "Permission",
        t("profile.edit.permissionMessage") || "Gallery access is required to pick an avatar."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAvatarPath(asset.uri);
      setCurrentAvatarUri(asset.uri);
      setRemoveAvatar(false);
    }
  }, [t]);

  const handleRemoveAvatar = useCallback(() => {
    setRemoveAvatar(true);
    setAvatarPath(null);
    setCurrentAvatarUri(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        username: form.username || undefined,
        email: form.email || undefined,
        about: form.about || undefined,
        favorite_tags: form.favorite_tags || undefined,
        current_password: form.old_password || undefined,
        new_password: form.new_password1 || undefined,
        remove_avatar: removeAvatar || undefined,
      });

      if (!removeAvatar && avatarPath) {
        const fd = new FormData();
        const filename = avatarPath.split("/").pop() || avatarPath.split("\\").pop() || "avatar.jpg";
        const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
        const mime =
          ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
        if (isElectron()) {
          const dataUrlResult = await (window as any).electron?.getFileAsDataUrl?.(avatarPath);
          if (dataUrlResult?.success && dataUrlResult?.dataUrl) {
            const res = await fetch(dataUrlResult.dataUrl);
            const blob = await res.blob();
            fd.append("avatar", blob, filename);
          }
        } else {
          fd.append("avatar", { uri: avatarPath, name: filename, type: mime } as any);
        }
        await uploadAvatar(fd);
      }

      setError(null);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2500);
    } catch (e: any) {
      const raw = e?.message || "Save failed";
      const friendly =
        raw.includes("ERR_INVALID_ARGUMENT") || raw.includes("ERR_")
          ? t("profile.edit.errorNetwork")
          : raw;
      setError(friendly);
    } finally {
      setSaving(false);
    }
  }, [form, removeAvatar, avatarPath, t]);

  const avatarUri = currentAvatarUri || (!removeAvatar ? initialAvatarUrl : null);
  const hasAvatar = Boolean(avatarUri);

  const InputField = ({
    label,
    value,
    onChangeText,
    icon,
    multiline,
    secureTextEntry,
    keyboardType,
    placeholder,
  }: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    icon: keyof typeof Feather.glyphMap;
    multiline?: boolean;
    secureTextEntry?: boolean;
    keyboardType?: "default" | "email-address";
    placeholder?: string;
  }) => (
    <View style={s.fieldWrap}>
      <View style={s.fieldLabelRow}>
        <Feather name={icon} size={13} color={ui.sub} />
        <Text style={[s.fieldLabel, { color: ui.sub }]}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          s.fieldInput,
          multiline && s.fieldTextArea,
          { backgroundColor: ui.inputBg, color: ui.text, borderColor: ui.border },
        ]}
        placeholderTextColor={ui.sub + "88"}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ title: t("profile.edit.title") }} />
        <View style={s.loadingWrap}>
          <Skeleton style={{ width: 96, height: 96, borderRadius: 32, alignSelf: "center", marginBottom: 20 }} />
          <View style={[s.card, { backgroundColor: ui.card }]}>
            <Skeleton style={{ height: 16, width: "30%", marginBottom: 10 }} />
            <Skeleton style={{ height: 44, borderRadius: 12, marginBottom: 16 }} />
            <Skeleton style={{ height: 16, width: "25%", marginBottom: 10 }} />
            <Skeleton style={{ height: 44, borderRadius: 12, marginBottom: 16 }} />
            <Skeleton style={{ height: 16, width: "35%", marginBottom: 10 }} />
            <Skeleton style={{ height: 80, borderRadius: 12 }} />
          </View>
        </View>
      </View>
    );
  }

  if (error && !form) {
    return (
      <View style={[s.container, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ title: t("profile.edit.title") }} />
        <View style={s.centered}>
          <View style={[s.errorCard, { backgroundColor: ui.card }]}>
            <Feather name="alert-circle" size={40} color={ui.danger} />
            <Text style={[s.errorCardTitle, { color: ui.text }]}>{error}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
                style={[s.outlineBtn, { borderColor: ui.border }]}
              >
                <Feather name="arrow-left" size={16} color={ui.text} />
                <Text style={[s.outlineBtnText, { color: ui.text }]}>{t("common.back")}</Text>
              </Pressable>
              <Pressable
                onPress={loadForm}
                style={[s.outlineBtn, { borderColor: ui.accent + "44", backgroundColor: ui.accent + "14" }]}
              >
                <Feather name="refresh-cw" size={16} color={ui.accent} />
                <Text style={[s.outlineBtnText, { color: ui.accent }]}>
                  {t("common.retry") || "Retry"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!form) return null;

  return (
    <View style={[s.container, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ title: t("profile.edit.title") }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Banners */}
          {error ? (
            <View style={[s.banner, { backgroundColor: ui.danger + "18" }]}>
              <Feather name="alert-triangle" size={15} color={ui.danger} />
              <Text style={[s.bannerText, { color: ui.danger }]}>{error}</Text>
            </View>
          ) : null}
          {savedMessage ? (
            <View style={[s.banner, { backgroundColor: ui.successBg }]}>
              <Feather name="check-circle" size={15} color={ui.accent} />
              <Text style={[s.bannerText, { color: ui.accent }]}>{t("profile.edit.saved")}</Text>
            </View>
          ) : null}

          {/* Avatar section */}
          <View style={[s.card, { backgroundColor: ui.card, alignItems: "center" }]}>
            <Pressable onPress={pickImage} style={s.avatarPressable}>
              <View style={[s.avatarCircle, { borderColor: ui.accent + "33" }]}>
                {hasAvatar ? (
                  <Image source={{ uri: avatarUri || "" }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarPlaceholder, { backgroundColor: ui.inputBg }]}>
                    <Feather name="user" size={36} color={ui.sub} />
                  </View>
                )}
                <View style={[s.avatarOverlay, { backgroundColor: "#00000066" }]}>
                  <Feather name="camera" size={20} color="#fff" />
                </View>
              </View>
            </Pressable>
            <View style={s.avatarBtns}>
              <Pressable
                onPress={pickImage}
                style={({ pressed }) => [
                  s.avatarActionBtn,
                  { backgroundColor: ui.accent + "18", opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="upload" size={14} color={ui.accent} />
                <Text style={[s.avatarActionText, { color: ui.accent }]}>
                  {t("profile.edit.changeAvatar")}
                </Text>
              </Pressable>
              {hasAvatar && (
                <Pressable
                  onPress={handleRemoveAvatar}
                  style={({ pressed }) => [
                    s.avatarActionBtn,
                    { backgroundColor: ui.danger + "14", opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="trash-2" size={14} color={ui.danger} />
                  <Text style={[s.avatarActionText, { color: ui.danger }]}>
                    {t("profile.edit.removeAvatar")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Profile info */}
          <View style={[s.card, { backgroundColor: ui.card }]}>
            <InputField
              label={t("profile.edit.username")}
              value={form.username}
              onChangeText={(v) => updateForm({ username: v })}
              icon="at-sign"
            />
            <InputField
              label={t("profile.edit.email")}
              value={form.email}
              onChangeText={(v) => updateForm({ email: v })}
              icon="mail"
              keyboardType="email-address"
            />
            <InputField
              label={t("profile.edit.about")}
              value={form.about}
              onChangeText={(v) => updateForm({ about: v })}
              icon="file-text"
              multiline
            />
            <InputField
              label={t("profile.edit.favoriteTags")}
              value={form.favorite_tags}
              onChangeText={(v) => updateForm({ favorite_tags: v })}
              icon="tag"
              placeholder="tag1, tag2, ..."
            />
          </View>

          {/* Blacklist link */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/profile/[id]/blacklist",
                params: { id: userId, slug: slugStr },
              })
            }
            style={({ pressed }) => [
              s.card,
              s.linkCard,
              { backgroundColor: ui.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={[s.linkIcon, { backgroundColor: ui.chipBg }]}>
              <Feather name="shield" size={18} color={ui.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.linkTitle, { color: ui.text }]}>
                {t("profile.edit.blacklist")}
              </Text>
              <Text style={[s.linkSub, { color: ui.sub }]}>
                {t("profile.blacklist.description") || "Manage hidden tags, artists, and more"}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={ui.sub} />
          </Pressable>

          {/* Password section */}
          <View style={[s.card, { backgroundColor: ui.card }]}>
            <Pressable
              onPress={() => setShowPasswords((v) => !v)}
              style={s.passwordToggle}
            >
              <View style={[s.linkIcon, { backgroundColor: ui.chipBg }]}>
                <Feather name="lock" size={16} color={ui.accent} />
              </View>
              <Text style={[s.passwordToggleText, { color: ui.text }]}>
                {t("profile.edit.changePassword")}
              </Text>
              <Feather
                name={showPasswords ? "chevron-up" : "chevron-down"}
                size={20}
                color={ui.sub}
              />
            </Pressable>
            {showPasswords && (
              <View style={{ marginTop: 16 }}>
                <InputField
                  label={t("profile.edit.oldPassword")}
                  value={form.old_password ?? ""}
                  onChangeText={(v) => updateForm({ old_password: v })}
                  icon="key"
                  secureTextEntry
                />
                <InputField
                  label={t("profile.edit.newPassword")}
                  value={form.new_password1 ?? ""}
                  onChangeText={(v) => updateForm({ new_password1: v })}
                  icon="lock"
                  secureTextEntry
                />
                <InputField
                  label={t("profile.edit.newPasswordAgain")}
                  value={form.new_password2 ?? ""}
                  onChangeText={(v) => updateForm({ new_password2: v })}
                  icon="lock"
                  secureTextEntry
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky save bar */}
      <View
        style={[
          s.bottomBar,
          {
            backgroundColor: ui.bg + "f0",
            paddingBottom: insets.bottom + 12,
            borderTopColor: ui.border,
          },
        ]}
      >
        <Pressable
          onPress={handleSubmit}
          disabled={saving}
          style={({ pressed }) => [
            s.saveBtn,
            {
              backgroundColor: ui.accent,
              opacity: saving ? 0.7 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{t("common.save")}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingWrap: { flex: 1, padding: 16 },
  scroll: { flex: 1 },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  bannerText: { fontSize: 13, fontWeight: "600", flex: 1 },

  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },

  // Avatar
  avatarPressable: { marginBottom: 14 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 32,
    borderWidth: 3,
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0,
  },
  avatarBtns: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  avatarActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  avatarActionText: { fontWeight: "700", fontSize: 13 },

  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldTextArea: { minHeight: 90, textAlignVertical: "top" },

  // Link card
  linkCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  linkTitle: { fontWeight: "700", fontSize: 15, marginBottom: 2 },
  linkSub: { fontSize: 12 },

  // Password
  passwordToggle: { flexDirection: "row", alignItems: "center", gap: 12 },
  passwordToggleText: { fontWeight: "700", fontSize: 15, flex: 1 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  errorCard: {
    borderRadius: 18,
    padding: 32,
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 360,
  },
  errorCardTitle: { fontSize: 15, textAlign: "center", fontWeight: "600" },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  outlineBtnText: { fontWeight: "700", fontSize: 14 },
});
