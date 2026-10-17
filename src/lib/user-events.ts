/**
 * Fire-and-forget helper for user.updated webhook dispatch.
 *
 * Collects every OAuth app the user has an active refresh token with, then
 * fans out a signed `user.updated` POST to each app's subscribed webhook
 * endpoints (see `lib/app-webhooks.ts` dispatcher).
 *
 * Payload shape matches what receivers like url.elixpo's
 * /api/webhooks/elixpo already expect on `user.updated`:
 *
 *   {
 *     event: "user.updated",          ← added by header X-Elixpo-Event
 *     elixpo_id: "<user-id>",
 *     updated_at: "<ISO timestamp>",
 *     data: {
 *       username?:     string,
 *       display_name?: string | null,
 *       avatar_url?:   string | null,
 *       email?:        string,
 *     }
 *   }
 *
 * Only fields the caller passes go in `data`. Receivers use that to know
 * which columns to UPDATE — no diffing on their end.
 *
 * Errors are caught and logged. Profile-edit endpoints must not 500 if a
 * downstream webhook is unreachable.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { defaultSecretResolver, dispatchAppEvent } from "./app-webhooks";
import { getDatabase } from "./d1-client";

export interface UserUpdatedFields {
    username?: string;
    email?: string;
    display_name?: string | null;
    avatar_url?: string | null;
}

export async function fireUserUpdated(
    userId: string,
    fields: UserUpdatedFields,
): Promise<void> {
    if (Object.keys(fields).length === 0) return;

    try {
        const db = await getDatabase();
        const r = await db
            .prepare(
                `SELECT DISTINCT client_id FROM refresh_tokens
                 WHERE user_id = ? AND client_id IS NOT NULL AND revoked = 0`,
            )
            .bind(userId)
            .all<{ client_id: string }>();
        const clientIds = (r.results || []).map((row) => row.client_id);
        if (clientIds.length === 0) return;

        const kv = (getRequestContext().env as any).KV as KVNamespace;
        await dispatchAppEvent(
            "user.updated",
            {
                elixpo_id: userId,
                updated_at: new Date().toISOString(),
                data: fields,
            },
            clientIds,
            defaultSecretResolver(kv),
        );
    } catch (err) {
        console.error("[user-events] fireUserUpdated failed:", err);
    }
}
