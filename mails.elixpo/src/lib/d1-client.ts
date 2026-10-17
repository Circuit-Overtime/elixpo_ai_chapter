/**
 * D1 client resolver.
 *
 * In Cloudflare Pages/Workers the database is the `DB` binding (env.DB).
 * In local `next dev` there is no binding, so we talk to D1 over the
 * Cloudflare REST API using CLOUDFLARE_* env vars. The returned object
 * implements the subset of the D1Database interface this app uses
 * (prepare/bind/first/all/run + batch).
 *
 * Mirrors payouts/accounts d1-client so the services behave identically.
 */

import type { D1Database } from "@cloudflare/workers-types";

let cachedDb: D1Database | null = null;

export async function getDatabase(): Promise<D1Database> {
    if (cachedDb) return cachedDb;

    // Cloudflare Pages runtime — use the binding from the request context.
    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const ctx = getRequestContext();
        const env = (ctx as any).env;
        if (env?.DB) {
            cachedDb = env.DB as D1Database;
            return cachedDb;
        }
    } catch {
        // Expected in local dev — fall through to the REST client.
    }

    // Fallback for some runtimes that surface bindings on process.env.
    const g = globalThis as any;
    if (g?.process?.env?.DB) {
        cachedDb = g.process.env.DB as D1Database;
        return cachedDb;
    }

    // Local dev — REST API client.
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const databaseId = process.env.CLOUDFLARE_DATABASE_ID;

    if (accountId && apiToken && databaseId) {
        cachedDb = createRestD1Client(accountId, apiToken, databaseId);
        return cachedDb;
    }

    throw new Error(
        "[D1] No database binding and missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_DATABASE_ID for the REST fallback.",
    );
}

function createRestD1Client(accountId: string, apiToken: string, databaseId: string): D1Database {
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;

    const query = async (sql: string, params: any[] = []): Promise<any> => {
        const res = await fetch(`${baseUrl}/query`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql, params }),
        });
        if (!res.ok) {
            const err: any = await res.json().catch(() => ({}));
            throw new Error(`D1 query error: ${err.errors?.[0]?.message || res.statusText}`);
        }
        return res.json();
    };

    const makeStatement = (sql: string, params: any[] = []): any => ({
        bind: (...args: any[]) => makeStatement(sql, args),
        run: async () => {
            const r = await query(sql, params);
            return r.result?.[0] || { success: true };
        },
        first: async (col?: string) => {
            const r = await query(sql, params);
            const row = r.result?.[0]?.results?.[0] || null;
            if (row && col) return row[col];
            return row;
        },
        all: async () => {
            const r = await query(sql, params);
            return { results: r.result?.[0]?.results || [], success: true };
        },
    });

    return {
        prepare: (sql: string) => makeStatement(sql),
        batch: async (statements: any[]) => {
            const out: any[] = [];
            for (const stmt of statements) out.push(await stmt.run());
            return out;
        },
        exec: async (sql: string) => query(sql),
    } as any;
}
