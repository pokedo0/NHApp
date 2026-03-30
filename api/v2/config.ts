/**
 * nhentai API v2 — Configuration / infrastructure
 *
 * GET /api/v2          API root (version info)
 * GET /api/v2/cdn      Legacy CDN list (optional fallback)
 * GET /api/v2/config   CDN hostnames (i1–i4, t1–t4) + announcement — primary for media URLs
 * GET /api/v2/pow      Proof-of-Work challenge (required for login/comment/register)
 * GET /api/v2/captcha  Captcha provider info
 */

import { nhApi, buildQuery } from "./client";
import type { AppSiteConfig, CaptchaInfo, CdnConfig, PowChallenge } from "./types";

/** API root — returns version string and status message. */
export async function getApiRoot(): Promise<{ version: string; message: string }> {
  // path is empty → hits /api/v2
  return nhApi.get("", { public: true });
}

/** Get CDN server list. Cache this — it rarely changes. */
export async function getCdnConfig(): Promise<CdnConfig> {
  return nhApi.get("/cdn", { public: true });
}

// ─── CDN URL resolver ─────────────────────────────────────────────────────────

/** v2 CDN uses numbered hosts (see GET /config); bare i./t. often fail for app requests. */
const FALLBACK_THUMB = "https://t1.nhentai.net";
const FALLBACK_IMAGE = "https://i1.nhentai.net";

let _thumbServer: string = FALLBACK_THUMB;
let _imageServer: string = FALLBACK_IMAGE;
let _cdnInitialized = false;
let _cdnInitPromise: Promise<void> | null = null;

async function loadCdnServers(): Promise<CdnConfig | null> {
  try {
    const cfg = await nhApi.get<AppSiteConfig>("/config", { public: true });
    if (
      Array.isArray(cfg.image_servers) &&
      cfg.image_servers.length > 0 &&
      Array.isArray(cfg.thumb_servers) &&
      cfg.thumb_servers.length > 0
    ) {
      return {
        image_servers: cfg.image_servers,
        thumb_servers: cfg.thumb_servers,
      };
    }
  } catch {
    /* fall through */
  }
  try {
    return await getCdnConfig();
  } catch {
    return null;
  }
}

/**
 * Pre-fetch CDN hosts from GET /config (primary), else /cdn, else i1/t1 defaults.
 * Concurrent callers share one in-flight request.
 */
export async function initCdn(): Promise<void> {
  if (_cdnInitialized) return;
  if (!_cdnInitPromise) {
    _cdnInitPromise = (async () => {
      try {
        const cfg = await loadCdnServers();
        if (cfg?.thumb_servers?.[0]) {
          _thumbServer = cfg.thumb_servers[0].replace(/\/$/, "");
        }
        if (cfg?.image_servers?.[0]) {
          _imageServer = cfg.image_servers[0].replace(/\/$/, "");
        }
      } catch {
        /* keep FALLBACK_* */
      } finally {
        _cdnInitialized = true;
        _cdnInitPromise = null;
      }
    })();
  }
  await _cdnInitPromise;
}

/**
 * v2 sometimes returns duplicate ".webp" (e.g. `cover.webp.webp`, `3t.webp.webp`).
 * CDN serves a single `.webp` — normalize before building URLs.
 */
export function normalizeV2MediaPath(path: string): string {
  if (!path) return path;
  let p = path.trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      u.pathname = u.pathname.replace(/\.webp\.webp$/i, ".webp");
      return u.toString();
    } catch {
      return p.replace(/\.webp\.webp$/i, ".webp");
    }
  }
  return p.replace(/\.webp\.webp$/i, ".webp");
}

function rewriteLegacyImageHost(absUrl: string): string {
  return absUrl.replace(/^https?:\/\/i\.nhentai\.net(?=\/|$)/i, _imageServer);
}

function rewriteLegacyThumbHost(absUrl: string): string {
  return absUrl.replace(/^https?:\/\/t\.nhentai\.net(?=\/|$)/i, _thumbServer);
}

/**
 * Build a full thumbnail URL from a path returned by the API.
 * Path examples: "/galleries/123456/thumb.jpg"  or full "https://…"
 */
export function resolveThumbUrl(path: string): string {
  if (!path) return "";
  const p = normalizeV2MediaPath(path);
  if (/^https?:\/\//.test(p)) return rewriteLegacyThumbHost(p);
  return _thumbServer + (p.startsWith("/") ? p : "/" + p);
}

/**
 * Build a full image URL from a path returned by the API.
 */
export function resolveImageUrl(path: string): string {
  if (!path) return "";
  const p = normalizeV2MediaPath(path);
  if (/^https?:\/\//.test(p)) return rewriteLegacyImageHost(p);
  return _imageServer + (p.startsWith("/") ? p : "/" + p);
}

/**
 * Get a Proof-of-Work challenge.
 * @param action  "login" | "comment" | "register" — difficulty varies per action
 */
export async function getPowChallenge(
  action?: string
): Promise<PowChallenge> {
  return nhApi.get(`/pow${buildQuery({ action })}`, { public: true });
}

/** Get captcha provider and public key. */
export async function getCaptchaInfo(): Promise<CaptchaInfo> {
  return nhApi.get("/captcha", { public: true });
}

/** Site config: CDN lists, announcement, etc. */
export async function getSiteConfig(): Promise<AppSiteConfig> {
  return nhApi.get("/config", { public: true });
}

// ─── PoW solver helper ────────────────────────────────────────────────────────

/**
 * Solve a Proof-of-Work challenge.
 * Finds a nonce such that SHA-256(challenge + nonce) starts with `difficulty` zero bits.
 *
 * This is a CPU-bound operation — run on background thread in production if needed.
 */
export async function solvePoW(
  challenge: string,
  difficulty: number
): Promise<string> {
  const target = Math.pow(2, 256 - difficulty);
  let nonce = 0;

  while (true) {
    const attempt = challenge + nonce.toString();
    const hash = await sha256Hex(attempt);
    if (hashMeetsDifficulty(hash, difficulty)) {
      return nonce.toString();
    }
    nonce++;
    // Yield occasionally to avoid blocking the JS thread for too long
    if (nonce % 10_000 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashMeetsDifficulty(hex: string, difficulty: number): boolean {
  // difficulty = number of leading zero bits required
  const zeroBits = Math.floor(difficulty / 4);
  const remainder = difficulty % 4;
  const prefix = "0".repeat(zeroBits);
  if (!hex.startsWith(prefix)) return false;
  if (remainder === 0) return true;
  const nextNibble = parseInt(hex[zeroBits], 16);
  return nextNibble < Math.pow(2, 4 - remainder);
}
