
import { NH_HOST } from "@/api/auth";
import type { Book, Paged } from "@/api/nhappApi/types";
import { galleryToBook } from "@/api/v2/compat";
import { getGallery } from "@/api/v2/galleries";
import { fetchHtml } from "./http";
import { extractGalleryIdsFromHtml, extractTotalPagesFromHtml } from "./scrape";

/** Max books per page on nhentai favorites (25 per page). */
const PER_PAGE = 25;

const EMPTY_PAGE = (page: number): Paged<Book> => ({
  items: [], books: [], totalPages: 1, currentPage: page, totalItems: 0,
});

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Only fetches HTML and returns gallery IDs + totalPages. No getBook calls. */
export async function getFavoritesPageIds(
  p: { page?: number } = {}
): Promise<{ ids: number[]; totalPages: number }> {
  const page = p.page ?? 1;
  const url = `${NH_HOST}/favorites/?page=${page}`;
  try {
    const { html, finalUrl } = await raceTimeout(fetchHtml(url), 20_000);
    const looksLikeLogin =
      finalUrl.includes("/login/") ||
      /<form[^>]+action=["']\/login\/?["']/i.test(html) ||
      /name=["']username_or_email["']/i.test(html);
    if (!html || looksLikeLogin) return { ids: [], totalPages: 1 };

    const ids = extractGalleryIdsFromHtml(html).slice(0, PER_PAGE);
    const totalPages = extractTotalPagesFromHtml(html);
    return { ids, totalPages };
  } catch {
    return { ids: [], totalPages: 1 };
  }
}

export const PER_BOOK_MS = 8_000;
export const BATCH_SIZE = 4;

/** Fetch one batch of books by IDs. Caller can setState after each batch and yield to UI. */
export async function getBooksBatch(ids: number[]): Promise<(Book | null)[]> {
  if (ids.length === 0) return [];
  return Promise.all(
    ids.map((id) => raceTimeout(getGallery(id).then(galleryToBook), PER_BOOK_MS).catch(() => null))
  );
}

/** Yield to UI thread so list can paint and not freeze. */
export function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function getFavoritesOnline(
  p: { page?: number } = {}
): Promise<Paged<Book>> {
  const page = p.page ?? 1;
  const { ids, totalPages } = await getFavoritesPageIds(p);
  if (ids.length === 0) return EMPTY_PAGE(page);

  const results: (Book | null)[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const fetched = await getBooksBatch(batch);
    results.push(...fetched);
    await yieldToUi();
  }
  const books = results.filter(Boolean) as Book[];
  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  books.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return { items: books, books, totalPages, currentPage: page, totalItems: books.length };
}
