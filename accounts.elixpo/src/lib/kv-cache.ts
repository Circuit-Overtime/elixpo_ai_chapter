import type { KVNamespace } from "@cloudflare/workers-types";

async function getKV(): Promise<KVNamespace | null> {
    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const { env } = getRequestContext() as { env: Record<string, any> };
        return (env?.KV as KVNamespace) ?? null;
    } catch {
        return null;
    }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
    const kv = await getKV();
    if (!kv) return null;
    try {
        const val = await kv.get(key, "json");
        return val as T | null;
    } catch {
        return null;
    }
}

export async function cacheSet(
    key: string,
    value: unknown,
    ttlSeconds: number,
): Promise<void> {
    const kv = await getKV();
    if (!kv) return;
    try {
        await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    } catch {
        /* non-fatal */
    }
}

export async function cacheDel(key: string): Promise<void> {
    const kv = await getKV();
    if (!kv) return;
    try {
        await kv.delete(key);
    } catch {
        /* non-fatal */
    }
}

export async function cacheGetOrSet<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
): Promise<T> {
    const cached = await cacheGet<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await cacheSet(key, value, ttlSeconds);
    return value;
}
