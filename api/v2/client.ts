/**
 * nhentai API v2 — platform-aware HTTP client
 *
 * Auth priority:
 *   1. Bearer access_token (from login/refresh)
 *   2. API key via Authorization: Api-Key <key>
 *
 * Platforms:
 *   - Native (iOS/Android): direct fetch + User-Agent header
 *   - Electron (web + electron flag): IPC via window.electron.fetchJson
 *   - Web (browser): fetch via proxy server (/fpi/nhentai/api/v2)
 *
 * Token refresh:
 *   On 401 automatically tries to refresh access_token and retries once.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── Constants ────────────────────────────────────────────────────────────────

export const NH_HOST = "https://nhentai.net";
export const API_V2_BASE = `${NH_HOST}/api/v2`;

/** Bundled API key — used as fallback when user is not logged in */
const STATIC_API_KEY: string | undefined =
  process.env.EXPO_PUBLIC_NHENTAI_API_KEY || undefined;

const STORAGE_KEY_ACCESS = "@v2.access_token";
const STORAGE_KEY_REFRESH = "@v2.refresh_token";

const PROXY_BASE =
  Platform.OS === "web"
    ? (process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3002") + "/fpi"
    : null;

// ─── Platform helpers ─────────────────────────────────────────────────────────

function isElectron(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    !!(window as any).electron?.isElectron
  );
}

export function resolveUrl(path: string): string {
  const full = path.startsWith("http") ? path : `${API_V2_BASE}${path}`;
  if (Platform.OS === "web" && !isElectron() && PROXY_BASE) {
    return full.replace(NH_HOST, `${PROXY_BASE}/nhentai`);
  }
  return full;
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function storeTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEY_ACCESS, accessToken],
    [STORAGE_KEY_REFRESH, refreshToken],
  ]);
}

export async function loadAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_ACCESS);
}

export async function loadRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_REFRESH);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY_ACCESS, STORAGE_KEY_REFRESH]);
}

export async function hasSession(): Promise<boolean> {
  const token = await loadAccessToken();
  return !!token;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Request options ──────────────────────────────────────────────────────────

export interface RequestOptions {
  /** Skip attaching Authorization header (public endpoints) */
  public?: boolean;
  /** Use this API key instead of stored access_token */
  apiKey?: string;
  /** Extra headers to merge */
  headers?: Record<string, string>;
  /** Skip auto-refresh on 401 */
  skipRefresh?: boolean;
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function buildHeaders(opts: RequestOptions): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...opts.headers,
  };

  if (Platform.OS !== "web") {
    headers["User-Agent"] = "nh-android-client/2.0";
  }

  if (!opts.public) {
    if (opts.apiKey) {
      headers["Authorization"] = `Key ${opts.apiKey}`;
    } else {
      const token = await loadAccessToken();
      if (token) {
        headers["Authorization"] = `User ${token}`;
      } else if (STATIC_API_KEY) {
        headers["Authorization"] = `Key ${STATIC_API_KEY}`;
      }
    }
  }

  return headers;
}

async function executeRequest(
  url: string,
  init: RequestInit,
  headers: Record<string, string>
): Promise<Response> {
  if (isElectron()) {
    const electron = (window as any).electron;
    if (electron?.fetchJson) {
      const result = await electron.fetchJson(url, {
        method: init.method || "GET",
        headers,
        body: init.body,
      });
      const responseHeaders = new Headers(result.headers || {});
      return new Response(result.body ?? "", {
        status: result.status ?? (result.success ? 200 : 500),
        headers: responseHeaders,
      });
    }
  }

  return fetch(url, { ...init, headers: new Headers(headers) });
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
  body?: unknown
): Promise<T> {
  const url = resolveUrl(path);
  const headers = await buildHeaders(opts);

  const init: RequestInit = {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res = await executeRequest(url, init, headers);

  // Auto-refresh on 401 (once)
  if (res.status === 401 && !opts.skipRefresh && !opts.public) {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      const retryHeaders = await buildHeaders(opts);
      res = await executeRequest(url, init, retryHeaders);
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data as any)?.detail ||
      (data as any)?.message ||
      (data as any)?.error ||
      `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

// ─── Token refresh (called internally) ───────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) return false;

      // Import here to avoid circular dependency
      const { refresh } = await import("./auth");
      const result = await refresh(refreshToken);
      await storeTokens(result.access_token, result.refresh_token);
      return true;
    } catch {
      await clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const nhApi = {
  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>("GET", path, opts);
  },

  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>("POST", path, opts, body);
  },

  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>("PUT", path, opts, body);
  },

  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>("DELETE", path, opts);
  },
};

// ─── Query string helper ──────────────────────────────────────────────────────

export function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
