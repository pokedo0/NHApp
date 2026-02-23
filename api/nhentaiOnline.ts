
export {
  getFavoritesOnline,
  getFavoritesPageIds,
  getBooksBatch,
  yieldToUi,
  BATCH_SIZE,
} from "./online/favorites";
export { getMe } from "./online/me";
export { getUserOverview, getUserProfile } from "./online/profile";
export { normalizeNhUrl } from "./online/scrape";
export type { Me, UserComment, UserOverview } from "./online/types";
import { NH_HOST, nhFetch } from "@/api/auth";
type FavoriteResponse = {
  favorited: boolean;
  num_favorites?: number[];
};
async function postFavoriteEndpoint(path: string): Promise<FavoriteResponse> {
  const res = await nhFetch(path, {
    method: "POST",
    csrf: true,          
    withAuth: true,      
    noCache: true,
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${NH_HOST}/favorites/`,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt || "request failed"}`);
  }
  return res.json();
}
export async function onlineFavorite(id: number) {
  return postFavoriteEndpoint(`/api/gallery/${id}/favorite`);
}
export async function onlineUnfavorite(id: number) {
  return postFavoriteEndpoint(`/api/gallery/${id}/unfavorite`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function onlineBulkUnfavorite(
  ids: number[],
  onProgress?: (done: number, total: number) => void
): Promise<{ failed: number[] }> {
  const total = ids.length;
  let done = 0;
  const failed: number[] = [];
  const CONCURRENCY = 4;
  const queue = [...ids];
  async function worker() {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await onlineUnfavorite(id);
      } catch {
        failed.push(id);
      } finally {
        done += 1;
        onProgress?.(done, total);
        await sleep(120);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, worker)
  );
  return { failed };
}
export async function onlineBulkFavorite(
  ids: number[],
  onProgress?: (done: number, total: number) => void
): Promise<{ failed: number[] }> {
  const total = ids.length;
  let done = 0;
  const failed: number[] = [];
  const CONCURRENCY = 4;
  const queue = [...ids];
  async function worker() {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await onlineFavorite(id);
      } catch {
        failed.push(id);
      } finally {
        done += 1;
        onProgress?.(done, total);
        await sleep(120);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, worker)
  );
  return { failed };
}
