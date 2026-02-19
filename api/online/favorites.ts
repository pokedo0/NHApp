
import { NH_HOST } from "@/api/auth";
import type { Book, Paged } from "@/api/nhentai";
import { getBook } from "@/api/nhentai";
import { fetchHtml } from "./http";
import { extractGalleryIdsFromHtml, extractTotalPagesFromHtml } from "./scrape";
export async function getFavoritesOnline(
  p: { page?: number } = {}
): Promise<Paged<Book>> {
  const page = p.page ?? 1;
  const url = `${NH_HOST}/favorites/?page=${page}`;
  try {
    const { html, finalUrl } = await fetchHtml(url);
    const looksLikeLogin =
      finalUrl.includes("/login/") ||
      /<form[^>]+action=["']\/login\/?["']/i.test(html) ||
      /name=["']username_or_email["']/i.test(html);
    if (!html || looksLikeLogin) {
      return { items: [], books: [], totalPages: 1, currentPage: page, totalItems: 0 };
    }
    const ids = extractGalleryIdsFromHtml(html).slice(0, 32);
    if (ids.length === 0) {
      return { items: [], books: [], totalPages: 1, currentPage: page, totalItems: 0 };
    }
    const books = (await Promise.all(ids.map((id) => getBook(id)))).filter(Boolean) as Book[];
    // сохранить порядок, как на странице
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    books.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    const totalPages = extractTotalPagesFromHtml(html);
    return { items: books, books, totalPages, currentPage: page, totalItems: books.length };
  } catch {
    return { items: [], books: [], totalPages: 1, currentPage: page, totalItems: 0 };
  }
}
