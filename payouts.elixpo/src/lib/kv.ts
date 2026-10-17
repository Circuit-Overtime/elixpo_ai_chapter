/**
 * KV resolver — mirrors d1-client. Uses the `KV` binding on Cloudflare, and
 * the Cloudflare REST API in local `next dev`. Used for idempotency / replay
 * guards and short-lived caches (handoff nonces, webhook event de-dup).
 */

import type { KVNamespace } from "@cloudflare/workers-types";

let cachedKv: KVNamespace | null = null;

interface KvLike {
    get(key: string): Promise<string | null>;
    put(
        key: string,
        value: string,
        opts?: { expirationTtl?: number },
    ): Promise<void>;
    delete(key: string): Promise<void>;
}

export async function getKV(): Promise<KvLike> {
    if (cachedKv) return cachedKv as unknown as KvLike;

    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const env = (getRequestContext() as any).env;
        if (env?.KV) {
            cachedKv = env.KV as KVNamespace;
            return cachedKv as unknown as KvLike;
        }
    } catch {
        // local dev — fall through
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const nsId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    if (accountId && apiToken && nsId) {
        return createRestKv(accountId, apiToken, nsId);
    }

    throw new Error(
        "[KV] No KV binding and missing CLOUDFLARE_* env for the REST fallback.",
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
                {
                    headers: auth,
                },
            );
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
            return res.text();
        },
        async put(key, value, opts) {
            const url = new URL(`${base}/values/${encodeURIComponent(key)}`);
            if (opts?.expirationTtl) {
                url.searchParams.set(
                    "expiration_ttl",
                    String(opts.expirationTtl),
                );
            }
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
    };
}
