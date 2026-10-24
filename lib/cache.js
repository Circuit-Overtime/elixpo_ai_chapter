/**
 * KV cache helper for Cloudflare Workers edge runtime.
 *
 * Pattern: read-through with explicit invalidation.
 * - kvCache(key, ttl, fetcher) — returns cached or fetches fresh
 * - kvInvalidate(...keys) — deletes specific keys
 * - kvPut(key, value, ttl) — manual put
 *
 * Degrades gracefully when KV is unavailable (local dev).
 */

// Shared by the sitemap producer and every mutation that can add, remove, or
// rename a public URL. Keeping this key in one place prevents publication paths
// from silently leaving crawler discovery data stale.
export const PUBLIC_SITEMAP_CACHE_KEY = 'v2:public-sitemap-rows';

/**
 * Read-through cache. Returns cached value if exists, otherwise calls fetcher,
 * caches the result, and returns it.
 *
 * @param {string} key - KV key
 * @param {number} ttlSeconds - Cache TTL in seconds
 * @param {() => Promise<T>} fetcher - Function that fetches fresh data from D1
 * @returns {Promise<T>}
 */
export async function kvCache(key, ttlSeconds, fetcher) {
  try {
    const { getKV } = await import('./cloudflare');
    const kv = getKV();

    // Try cache first
    const cached = await kv.get(key, 'json');
    if (cached !== null) {
      // Check for empty sentinel
      if (cached?.__empty) return cached.__value;
      return cached;
    }

    // Cache miss — fetch fresh
    const fresh = await fetcher();

    // Write to KV non-blocking
    const value = fresh === null || fresh === undefined
      ? JSON.stringify({ __empty: true, __value: fresh })
      : JSON.stringify(fresh);

    try {
      const { getRequestContext } = await import('@cloudflare/next-on-pages');
      const ctx = getRequestContext().ctx;
      ctx.waitUntil(kv.put(key, value, { expirationTtl: ttlSeconds }));
    } catch {
      // waitUntil not available (local dev) — fire and forget
      kv.put(key, value, { expirationTtl: ttlSeconds }).catch(() => {});
    }

    return fresh;
  } catch {
    // KV unavailable — fallback to direct fetch
    return fetcher();
  }
}

/**
 * Invalidate specific cache keys.
 */
export async function kvInvalidate(...keys) {
  try {
    const { getKV } = await import('./cloudflare');
    const kv = getKV();
    await Promise.all(keys.filter(Boolean).map(k => kv.delete(k)));
  } catch {
    // KV unavailable — no-op
  }
}

/**
 * Manually put a value into cache.
 */
export async function kvPut(key, value, ttlSeconds) {
  try {
    const { getKV } = await import('./cloudflare');
    const kv = getKV();
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {}
}

export function mediaInventoryCacheKey(userId) {
  return `v3:media-inventory:${userId}`;
}
