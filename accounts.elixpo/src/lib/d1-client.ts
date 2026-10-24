/**
 * D1 Client for Next.js
 *
 * In a Cloudflare Pages/Workers environment, D1 is available via `env.DB`
 * In a Next.js local environment, we need to connect via the Cloudflare API
 *
 * For development, this uses the local D1 instance or fetches from Cloudflare
 */

import type { D1Database } from "@cloudflare/workers-types";

let cachedDb: D1Database | null = null as any;
let cachedDbType: "cloudflare" | "api" | "mock" | null = null;

/**
 * Initialize and get D1 Database connection
 * In Cloudflare environment: Uses the runtime binding via getRequestContext()
 * In local environment: Uses Cloudflare REST API
 */
export async function getDatabase(): Promise<D1Database> {
    // Return cached connection if available (but never cache the in-memory mock)
    if (cachedDb && cachedDbType !== "mock") {
        return cachedDb;
    }

    // In Cloudflare Pages environment — use @cloudflare/next-on-pages runtime context
    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const ctx = getRequestContext();
        const env = (ctx as any).env;
        if (env?.DB) {
            cachedDb = env.DB as D1Database;
            cachedDbType = "cloudflare";
            return cachedDb!;
        }
    } catch {
        // Expected in local dev — fall through to API client
    }

    // Fallback: try process.env.DB or globalThis.process.env
    try {
        const g = globalThis as any;
        if (g?.process?.env?.DB) {
            cachedDb = g.process.env.DB as D1Database;
            cachedDbType = "cloudflare";
            return cachedDb!;
        }
    } catch {
        // not available
    }

    // Local development: Create a D1 client using Cloudflare REST API
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const databaseId = process.env.CLOUDFLARE_DATABASE_ID;

    if (accountId && apiToken && databaseId) {
        cachedDb = createLocalD1Client(accountId, apiToken, databaseId);
        cachedDbType = "api";
        console.log(
            "[D1] Using Cloudflare REST API client for local development",
        );
        return cachedDb;
    }

    // Fallback: Create in-memory mock (for testing without D1)
    console.warn(
        "[D1] Using in-memory mock database - not suitable for production",
    );
    cachedDbType = "mock";
    return createInMemoryMockDb();
}

/**
 * Create a local D1 client using Cloudflare API
 */
function createLocalD1Client(
    accountId: string,
    apiToken: string,
    databaseId: string,
): D1Database {
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;

    const query = async (sql: string, params: any[] = []): Promise<any> => {
        const response = await fetch(`${baseUrl}/query`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql, params }),
        });
        if (!response.ok) {
            const error: any = await response.json();
            throw new Error(
                `D1 Query Error: ${error.message || response.statusText}`,
            );
        }
        return response.json();
    };

    // `sql` and `params` are exposed on the returned statement so the
    // batch() shim below can read them after .bind(). Without this they
    // were captured in closure only and the batch payload sent
    // `{sql: undefined}` to the API.
    const makeStatement = (sql: string, params: any[] = []): any => ({
        sql,
        params,
        bind: (...args: any[]) => makeStatement(sql, args),
        run: async () => {
            const result = await query(sql, params);
            return result.result?.[0] || { success: true };
        },
        first: async () => {
            const result = await query(sql, params);
            return result.result?.[0]?.results?.[0] || null;
        },
        all: async () => {
            const result = await query(sql, params);
            return {
                results: result.result?.[0]?.results || [],
                success: true,
            };
        },
    });

    return {
        prepare: (sql: string) => makeStatement(sql),
        // Dev-mode batch: the CF D1 REST API doesn't expose true atomic
        // batched calls (only the Worker binding does). We fall back to
        // sequential execution so the surface matches what production
        // sees. Production via the bound D1 object gets real
        // transactional batch semantics — losing them in dev is
        // acceptable since dev never sees concurrent traffic.
        batch: async (statements: any[]) => {
            const results: any[] = [];
            for (const stmt of statements) {
                const r = await query(stmt.sql, stmt.params || []);
                results.push(r.result?.[0] || { success: true });
            }
            return results;
        },
        exec: async (sql: string) => {
            const response = await fetch(`${baseUrl}/query`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sql }),
            });
            if (!response.ok) {
                const error: any = await response.json();
                throw new Error(
                    `D1 Exec Error: ${error.errors?.[0]?.message || response.statusText}`,
                );
            }
            return response.json();
        },
    } as any;
}

/**
 * In-memory mock database for testing without D1 connection
 * WARNING: Data is not persisted between server restarts
 */
function createInMemoryMockDb(): D1Database {
    const _data = new Map<string, any[]>();

    const makeMockStatement = (sql: string): any => ({
        bind: (..._args: any[]) => makeMockStatement(sql),
        run: async () => {
            console.warn("[Mock DB] run: %s", sql.substring(0, 50));
            return { success: true };
        },
        first: async () => {
            console.warn("[Mock DB] first: %s", sql.substring(0, 50));
            return null;
        },
        all: async () => {
            console.warn("[Mock DB] all: %s", sql.substring(0, 50));
            return { results: [], success: true };
        },
    });

    return {
        prepare: (sql: string) => makeMockStatement(sql),
        batch: async () => ({ success: true }),
        exec: async () => ({ success: true }),
    } as any;
}

/**
 * Close database connection if needed
 */
export async function closeDatabase(): Promise<void> {
    cachedDb = null;
}
