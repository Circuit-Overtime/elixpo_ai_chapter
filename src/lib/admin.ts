/**
 * Admin determination — the source of truth is the `role` column in the
 * elixpo_auth (accounts) D1 database: a user is an admin iff role = 'admin'.
 * We query it directly (via the scoped CF token's D1 read) rather than trusting
 * a derived flag, so promotions/demotions take effect immediately.
 */

import { acctPath, cfRest } from "./cloudflare-api";
import { getEnv } from "./env";

// elixpo_auth database id (overridable via env for other environments).
const DEFAULT_AUTH_DB_ID = "f7455042-ed14-466a-9461-5fd36f628746";

export async function isAdminByRole(opts: {
    id?: string;
    email?: string;
}): Promise<boolean> {
    const id = (opts.id || "").trim();
    const email = (opts.email || "").trim();
    if (!id && !email) return false;

    const dbId = (await getEnv("ELIXPO_AUTH_DB_ID")) || DEFAULT_AUTH_DB_ID;
    try {
        const env = await cfRest<any>(
            await acctPath(`/d1/database/${dbId}/query`),
            {
                method: "POST",
                body: JSON.stringify({
                    sql: "SELECT role FROM users WHERE id = ? OR lower(email) = lower(?) LIMIT 1;",
                    params: [id, email],
                }),
            },
        );
        const row = env.result?.[0]?.results?.[0];
        return String(row?.role || "").toLowerCase() === "admin";
    } catch {
        return false;
    }
}
