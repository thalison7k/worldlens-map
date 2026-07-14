/**
 * Tiny cache with TTL + stale-while-revalidate.
 * Backed by an in-memory Map plus localStorage (best effort — some values are
 * large so we cap what we persist).
 */
export type CacheEntry<T> = { value: T; ts: number };

const mem = new Map<string, CacheEntry<unknown>>();
const NS = "geoos:cache:";

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  const now = Date.now();
  const hit = mem.get(key) as CacheEntry<T> | undefined;
  if (hit && now - hit.ts <= maxAgeMs) return hit.value;
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw) {
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (now - entry.ts <= maxAgeMs) {
          mem.set(key, entry);
          return entry.value;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function writeCache<T>(key: string, value: T, persist = true): void {
  const entry: CacheEntry<T> = { value, ts: Date.now() };
  mem.set(key, entry);
  if (persist && typeof localStorage !== "undefined") {
    try {
      const raw = JSON.stringify(entry);
      if (raw.length < 500_000) localStorage.setItem(NS + key, raw);
    } catch { /* quota */ }
  }
}

export async function swr<T>(
  key: string,
  maxAgeMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = readCache<T>(key, maxAgeMs);
  if (cached !== null) return cached;
  try {
    const fresh = await fetcher();
    writeCache(key, fresh);
    return fresh;
  } catch (err) {
    // fall back to stale-any if we have anything at all
    const stale = readCache<T>(key, Number.POSITIVE_INFINITY);
    if (stale !== null) return stale;
    throw err;
  }
}
