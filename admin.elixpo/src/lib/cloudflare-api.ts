/**
 * Low-level Cloudflare API client used by discovery + metrics + management.
 *
 * - REST   : https://api.cloudflare.com/client/v4   (inventory + mutations)
 * - GraphQL: https://api.cloudflare.com/client/v4/graphql  (analytics/charts)
 *
 * Auth comes from the admin app's OWN dedicated, scoped token (CF_API_TOKEN),
 * kept separate from the wrangler/CI token (CLOUDFLARE_API_TOKEN) so the
 * dashboard's blast radius is isolated and independently revocable. The account
 * id falls back to CLOUDFLARE_ACCOUNT_ID since it's the same account.
 */

import { getEnv, requireEnv } from "./env";

const API = "https://api.cloudflare.com/client/v4";

export interface ResultInfo {
    page?: number;
    per_page?: number;
    count?: number;
    total_count?: number;
    total_pages?: number;
    cursor?: string;
}

export interface CfEnvelope<T> {
    success: boolean;
    result: T;
    result_info?: ResultInfo;
    errors?: { code?: number; message: string }[];
    messages?: unknown[];
}

export class CloudflareApiError extends Error {
    status: number;
    errors?: { code?: number; message: string }[];
    constructor(
        status: number,
        message: string,
        errors?: { code?: number; message: string }[],
    ) {
        super(message);
        this.name = "CloudflareApiError";
        this.status = status;
        this.errors = errors;
    }
}

async function token(): Promise<string> {
    return requireEnv("CF_API_TOKEN");
}

export async function getAccountId(): Promise<string> {
    return (
        (await getEnv("CF_ACCOUNT_ID")) || requireEnv("CLOUDFLARE_ACCOUNT_ID")
    );
}

/** A single REST call. Throws CloudflareApiError on non-2xx / success:false. */
export async function cfRest<T = any>(
    path: string,
    init?: RequestInit,
): Promise<CfEnvelope<T>> {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    const res = await fetch(url, {
        ...init,
        headers: {
            "Authorization": `Bearer ${await token()}`,
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
    });
    const body = (await res.json().catch(() => ({
        success: false,
        result: null as T,
        errors: [{ message: res.statusText }],
    }))) as CfEnvelope<T>;
    if (!res.ok || body.success === false) {
        const msg =
            body.errors?.[0]?.message ||
            res.statusText ||
            "Cloudflare API error";
        throw new CloudflareApiError(res.status, msg, body.errors);
    }
    return body;
}

/** Prefix a path with /accounts/:id. */
export async function acctPath(p: string): Promise<string> {
    return `/accounts/${await getAccountId()}${p}`;
}

/**
 * Page-based list helper. Walks `page`/`per_page` until total_pages is reached.
 * Returns the flattened result array. `path` may already contain a querystring.
 */
export async function cfList<T = any>(
    path: string,
    opts?: { perPage?: number; max?: number },
): Promise<T[]> {
    const perPage = opts?.perPage ?? 50;
    let page = 1;
    const out: T[] = [];
    // Guard against runaway pagination.
    for (let i = 0; i < 100; i++) {
        const sep = path.includes("?") ? "&" : "?";
        const env = await cfRest<T[]>(
            `${path}${sep}page=${page}&per_page=${perPage}`,
        );
        const batch = (env.result || []) as T[];
        out.push(...batch);
        const info = env.result_info;
        if (opts?.max && out.length >= opts.max) break;
        if (!info?.total_pages || page >= info.total_pages) break;
        page++;
    }
    return out;
}

/** A single GraphQL Analytics query. Throws on transport or GraphQL errors. */
export async function cfGraphQL<T = any>(
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await fetch(`${API}/graphql`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${await token()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => null)) as {
        data?: T;
        errors?: { message: string }[];
    } | null;
    if (!res.ok) {
        throw new CloudflareApiError(res.status, `GraphQL HTTP ${res.status}`);
    }
    if (body?.errors?.length) {
        throw new CloudflareApiError(
            200,
            body.errors[0]?.message || "GraphQL error",
            body.errors,
        );
    }
    return body?.data as T;
}

/**
 * Run a thunk and capture failures instead of throwing — used by discovery and
 * metrics so a single missing scope / unentitled product never breaks the page.
 */
export async function safe<T>(
    fn: () => Promise<T>,
): Promise<
    { ok: true; data: T } | { ok: false; error: string; status?: number }
> {
    try {
        return { ok: true, data: await fn() };
    } catch (e) {
        const err = e as CloudflareApiError;
        return {
            ok: false,
            error: err.message || String(e),
            status: err.status,
        };
    }
}
