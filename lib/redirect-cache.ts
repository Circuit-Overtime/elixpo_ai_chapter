export interface CachedRedirect {
  url: string;
  id?: number;
  guest?: boolean;
  expires_at?: string | null;
}

const DEFAULT_CACHE_TTL = 24 * 60 * 60;
const MIN_KV_TTL = 60;

/** Cache a redirect without allowing KV to outlive the link's expiry. */
export async function putRedirectCache(
  kv: KVNamespace,
  code: string,
  entry: CachedRedirect,
): Promise<void> {
  let expirationTtl = DEFAULT_CACHE_TTL;
  if (entry.expires_at) {
    expirationTtl = Math.floor(
      (Date.parse(entry.expires_at) - Date.now()) / 1000,
    );
    // Cloudflare KV requires TTLs of at least 60 seconds. Very short-lived
    // links stay on the authoritative D1 path instead of being over-cached.
    if (!Number.isFinite(expirationTtl) || expirationTtl < MIN_KV_TTL) {
      await kv.delete(`url:${code}`);
      return;
    }
  }

  await kv.put(`url:${code}`, JSON.stringify(entry), { expirationTtl });
}

export function isCachedRedirectExpired(entry: CachedRedirect): boolean {
  return !!entry.expires_at && Date.parse(entry.expires_at) <= Date.now();
}
