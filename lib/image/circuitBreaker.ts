type Entry = { fails: number; untilTs: number };

const BAD_URL_TTL_MS = 30_000;
const FAIL_THRESHOLD = 2;

const map = new Map<string, Entry>();

export function canAttempt(url: string) {
  const e = map.get(url);
  if (!e) return true;
  if (Date.now() > e.untilTs) {
    map.delete(url);
    return true;
  }
  return e.fails < FAIL_THRESHOLD;
}

export function markFailure(url: string) {
  const now = Date.now();
  const e = map.get(url);
  const next = { fails: (e?.fails ?? 0) + 1, untilTs: now + BAD_URL_TTL_MS };
  map.set(url, next);
}

export function resetUrl(url: string) {
  map.delete(url);
}
