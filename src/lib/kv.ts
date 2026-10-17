/**
 * KV resolver for the admin app's own `admin-cache` namespace (discovery cache,
 * analytics cache, audit log). Uses the `KV` binding on Cloudflare and the
 * Cloudflare REST API in local `next dev`. Mirrors payouts.elixpo's kv helper,
 * extended with `list` for prefix scans.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

let cachedKv: KvLike | null = null;

export interface KvLike {
    get(key: string): Promise<string | null>;
    put(
        key: string,
        value: string,
        opts?: { expirationTtl?: number },
    ): Promise<void>;
    delete(key: string): Promise<void>;
    list(opts?: { prefix?: string; limit?: number }): Promise<{
        keys: { name: string }[];
    }>;
}

export async function getKV(): Promise<KvLike> {
    if (cachedKv) return cachedKv;

    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const env = (getRequestContext() as any).env;
        if (env?.KV) {
            cachedKv = env.KV as unknown as KvLike;
            return cachedKv;
        }
    } catch {
        // local dev — fall through to REST
    }

    // Local dev: use the admin app's dedicated token (CF_API_TOKEN, with KV Edit)
    // so cache + audit-log writes to admin-cache work without the binding.
    const accountId =
        process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken =
        process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    const nsId =
        process.env.CF_KV_NAMESPACE_ID ||
        process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    if (accountId && apiToken && nsId) {
        cachedKv = createRestKv(accountId, apiToken, nsId);
        return cachedKv;
    }

    throw new Error(
        "[KV] No KV binding and missing CF_ACCOUNT_ID / CF_API_TOKEN / CF_KV_NAMESPACE_ID for the REST fallback.",
    );
}

function createRestKv(
    accountId: string,
    apiToken: string,
    nsId: string,
): KvLike {
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${nsId}`;
    const auth = { "Authorization": `Bearer ${apiToken}` };

    return {
        async get(key) {
            const res = await fetch(
                `${base}/values/${encodeURIComponent(key)}`,
                { headers: auth },
            );
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
            return res.text();
        },
        async put(key, value, opts) {
            const url = new URL(`${base}/values/${encodeURIComponent(key)}`);
            if (opts?.expirationTtl)
                url.searchParams.set(
                    "expiration_ttl",
                    String(opts.expirationTtl),
                );
            const res = await fetch(url, {
                method: "PUT",
                headers: { ...auth, "Content-Type": "text/plain" },
                body: value,
            });
            if (!res.ok) throw new Error(`KV put failed: ${res.status}`);
        },
        async delete(key) {
            await fetch(`${base}/values/${encodeURIComponent(key)}`, {
                method: "DELETE",
                headers: auth,
            });
        },
        async list(opts) {
            const url = new URL(`${base}/keys`);
            if (opts?.prefix) url.searchParams.set("prefix", opts.prefix);
            if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
            const res = await fetch(url, { headers: auth });
            if (!res.ok) throw new Error(`KV list failed: ${res.status}`);
            const body = (await res.json()) as { result?: { name: string }[] };
            return { keys: body.result || [] };
        },
    };
}

/** JSON cache helper: returns parsed value or null. */
export async function cacheGet<T>(key: string): Promise<T | null> {
    const kv = await getKV();
    const raw = await kv.get(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

/** JSON cache helper with TTL (seconds). */
export async function cacheSet(
    key: string,
    value: unknown,
    ttlSeconds = 60,
): Promise<void> {
    const kv = await getKV();
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

/**
 * Read-through cache for expensive (GraphQL) calls — cuts repeat-load latency.
 * Best-effort: any KV hiccup falls back to calling the function directly.
 */
export async function cached<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
): Promise<T> {
    try {
        const hit = await cacheGet<T>(key);
        if (hit !== null) return hit;
    } catch {
        // ignore cache read failure
    }
    const value = await fn();
    cacheSet(key, value, ttlSeconds).catch(() => {});
    return value;
}
