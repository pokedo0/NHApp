/**
 * nhentai blacklist: load page, autocomplete, submit.
 * Works on Electron (IPC) and native Android/iOS (HTTP with cookies).
 */

import { Platform } from "react-native";
import { NH_HOST, nhFetch, loadTokens, cookieHeaderString, hasNativeCookieJar } from "@/api/auth";
import { fetchHtml } from "./http";

const isElectron = () =>
  typeof window !== "undefined" && !!(window as any).electron?.isElectron;

const isNative = () => Platform.OS === "android" || Platform.OS === "ios";

export type BlacklistItem = { id: number; name: string; type: string };

export type BlacklistLoadResult =
  | { success: true; html: string }
  | { success: false; error: string };

export async function fetchBlacklistPage(
  userId: string,
  slug: string
): Promise<BlacklistLoadResult> {
  if (isElectron()) {
    const electron = (window as any).electron;
    if (!electron?.fetchBlacklistPage) return { success: false, error: "Not available" };
    try {
      const result = await electron.fetchBlacklistPage({ userId, slug });
      if (result.success && result.html != null)
        return { success: true, html: result.html };
      return { success: false, error: result.error || "Unknown error" };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  if (isNative()) {
    try {
      const url = `${NH_HOST}/users/${userId}/${encodeURIComponent(slug)}/blacklist`;
      const { html, finalUrl, status } = await fetchHtml(url);

      if (!html || status === 0) {
        return { success: false, error: "Network error" };
      }
      if (finalUrl.includes("/login") || status === 302 || status === 301) {
        return { success: false, error: "not_logged_in" };
      }
      if (status >= 400) {
        return { success: false, error: `HTTP ${status}` };
      }
      return { success: true, html };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  return { success: false, error: "Platform not supported" };
}

export type AutocompleteResult =
  | { success: true; result: BlacklistItem[] }
  | { success: false; error: string };

export async function fetchAutocomplete(
  name: string,
  type: string
): Promise<AutocompleteResult> {
  if (isElectron()) {
    const electron = (window as any).electron;
    if (!electron?.fetchAutocomplete) return { success: false, error: "Not available" };
    try {
      const result = await electron.fetchAutocomplete({ name: name || "", type: type || "tag" });
      if (result.success) return { success: true, result: result.result || [] };
      return { success: false, error: result.error || "Unknown error" };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  if (isNative()) {
    try {
      const body = new URLSearchParams({
        name: String(name || ""),
        type: String(type || "tag"),
      }).toString();

      const res = await nhFetch("/api/autocomplete", {
        method: "POST",
        withAuth: true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
      });

      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const json = await res.json();
      return { success: true, result: json.result || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  return { success: false, error: "Platform not supported" };
}

export type SubmitBlacklistResult =
  | { success: true }
  | { success: false; error: string };

export async function submitBlacklist(
  userId: string,
  slug: string,
  payload: { added: BlacklistItem[]; removed: BlacklistItem[] }
): Promise<SubmitBlacklistResult> {
  if (isElectron()) {
    const electron = (window as any).electron;
    if (!electron?.submitBlacklist) return { success: false, error: "Not available" };
    try {
      const result = await electron.submitBlacklist({
        userId,
        slug,
        added: payload.added || [],
        removed: payload.removed || [],
      });
      if (result.success) return { success: true };
      return { success: false, error: result.error || "Unknown error" };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  if (isNative()) {
    try {
      const tokens = await loadTokens();
      if (!tokens.csrftoken) {
        return { success: false, error: "csrf_not_found" };
      }

      const url = `/users/${userId}/${encodeURIComponent(slug)}/blacklist`;
      const body = JSON.stringify({
        added: payload.added || [],
        removed: payload.removed || [],
      });

      const res = await nhFetch(url, {
        method: "POST",
        csrf: true,
        withAuth: true,
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "X-Requested-With": "XMLHttpRequest",
          Origin: NH_HOST,
          Referer: `${NH_HOST}${url}`,
        },
        body,
      });

      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Request failed" };
    }
  }

  return { success: false, error: "Platform not supported" };
}
