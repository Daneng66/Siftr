/**
 * Tiny TTL cache for the library stats summary (`GET /api/stats`). Stats are
 * stable and queried frequently (the sidebar polls after every invalidation),
 * so caching avoids re-running the duplicate CTE on every request.
 *
 * It lives in the db layer rather than the route so any mutation that changes
 * the underlying tables (e.g. clearLibrary) can invalidate it without the db
 * layer depending on the routes layer.
 */
const TTL_MS = 10_000;
let cache: { data: unknown; expiresAt: number } | null = null;

/** Cached stats if still fresh, otherwise null. */
export function getCachedStats(): unknown | null {
  if (cache && Date.now() < cache.expiresAt) return cache.data;
  return null;
}

export function setCachedStats(data: unknown): void {
  cache = { data, expiresAt: Date.now() + TTL_MS };
}

export function invalidateStatsCache(): void {
  cache = null;
}
