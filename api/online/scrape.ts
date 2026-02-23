
import { NH_HOST } from "@/api/auth";
import type { Me } from "./types";
export function extractGalleryIdsFromHtml(html: string): number[] {
  const ids = new Set<number>();
  const re = /\/g\/(\d+)\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.add(Number(m[1]));
  return [...ids];
}
export function extractTotalPagesFromHtml(html: string): number {
  const nums = Array.from(html.matchAll(/[?&]page=(\d+)/g)).map((m) => Number(m[1]));
  const max = nums.length ? Math.max(...nums) : 1;
  return Math.max(1, max);
}
export function normalizeNhUrl(u?: string): string {
  if (!u) return "";
  const s = u.trim();
  if (!s) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/avatars/") || s.startsWith("avatars/")) {
    const path = s.startsWith("/") ? s.slice(1) : s;
    return "https://i.nhentai.net/" + path;
  }
  if (/^i\d\.nhentai\.net\/avatars/.test(s)) {
    return "https://" + s;
  }
  if (s.startsWith("/")) return NH_HOST + s;
  return s;
}
export function tryParseUserFromAppScript(html: string): Partial<Me> | null {
  const m = html.match(/user\s*:\s*JSON\.parse\((["'])(.*?)\1\)/i);
  if (!m) return null;
  try {
    const jsonStr = m[2];
    const user = JSON.parse(jsonStr);
    const id = Number(user?.id) || undefined;
    const username = String(user?.username || "").trim();
    const slug = String(user?.slug || "").trim() || undefined;
    const avatar_url = user?.avatar_url ? normalizeNhUrl(String(user.avatar_url)) : undefined;
    const profile_url =
      id && (slug || username)
        ? `${NH_HOST}/users/${id}/${encodeURIComponent(slug || username)}/`
        : undefined;
    if (!username) return null;
    return { id, username, slug, avatar_url, profile_url };
  } catch {
    return null;
  }
}
export function tryParseUserFromRightMenu(html: string): Partial<Me> | null {
  const mMenu = html.match(
    /<ul[^>]*class=["'][^"']*\bmenu\b[^"']*\bright\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
  );
  const menuHtml = mMenu ? mMenu[1] : html;
  const mUserLink = menuHtml.match(
    /<a\s+href=["'](\/users\/(\d+)\/([^"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>/i
  );
  if (!mUserLink) return null;
  const profile_url = normalizeNhUrl(
    mUserLink[1].endsWith("/") ? mUserLink[1] : mUserLink[1] + "/"
  );
  const id = Number(mUserLink[2]) || undefined;
  const slug = decodeURIComponent(mUserLink[3] || "") || undefined;
  const inner = mUserLink[4] || "";
  const mUserName = inner.match(
    /<span[^>]*class=["'][^"']*\busername\b[^"']*["'][^>]*>([^<]+)<\/span>/i
  );
  let username = mUserName ? mUserName[1].trim() : "";
  if (!username && slug) username = slug;
  if (!username) return null;
  const mImg = inner.match(/<img[^>]+(?:data-src|src)=["']([^"']*avatars[^"']+)["'][^>]*>/i);
  const avatar_url = mImg ? normalizeNhUrl(mImg[1]) : undefined;
  return { id, username, slug, avatar_url, profile_url };
}
