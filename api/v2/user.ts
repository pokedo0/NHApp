/**
 * nhentai API v2 — Current user (me)
 *
 * GET    /api/v2/user             Get own profile (private fields)
 * PUT    /api/v2/user             Update profile
 * DELETE /api/v2/user             Delete account
 * POST   /api/v2/user/avatar      Upload avatar (multipart/form-data)
 * GET    /api/v2/user/keys        List API keys
 * POST   /api/v2/user/keys        Create API key
 * DELETE /api/v2/user/keys/:id    Revoke API key
 *
 * Auth: User Token required for all endpoints
 */

import { nhApi, loadAccessToken, resolveUrl, ApiError } from "./client";
import type { ApiKey, Me, SuccessResponse } from "./types";

// ─── Profile ──────────────────────────────────────────────────────────────────

let getMeInflight: Promise<Me> | null = null;

/** GET /user — параллельные вызовы (старт + SideMenu + хуки) делят один запрос. */
export async function getMe(): Promise<Me> {
  if (!getMeInflight) {
    getMeInflight = nhApi.get<Me>("/user").finally(() => {
      getMeInflight = null;
    });
  }
  return getMeInflight;
}

export interface UpdateProfileParams {
  username?: string;
  email?: string;
  about?: string;
  favorite_tags?: string;
  current_password?: string;
  new_password?: string;
  remove_avatar?: boolean;
}

export async function updateProfile(
  params: UpdateProfileParams
): Promise<SuccessResponse & { username: string; email: string; avatar_url: string }> {
  return nhApi.put("/user", params);
}

export async function deleteAccount(): Promise<SuccessResponse> {
  return nhApi.delete("/user");
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

/**
 * Upload a new avatar image.
 * @param formData FormData with an "avatar" file field attached.
 */
export async function uploadAvatar(
  formData: FormData
): Promise<SuccessResponse & { avatar_url: string }> {
  const url = resolveUrl("/user/avatar");
  const token = await loadAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `User ${token}`;
  // Do NOT set Content-Type — browser sets it with multipart boundary automatically

  const res = await fetch(url, { method: "POST", headers, body: formData });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      data?.detail || data?.message || `HTTP ${res.status}`,
      res.status,
      data
    );
  }
  return data;
}

// ─── API keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(): Promise<ApiKey[]> {
  return nhApi.get("/user/keys");
}

export async function createApiKey(
  name: string
): Promise<ApiKey & { key: string }> {
  return nhApi.post("/user/keys", { name });
}

export async function revokeApiKey(keyId: string): Promise<SuccessResponse> {
  return nhApi.delete(`/user/keys/${keyId}`);
}
