/**
 * Monthly Active User counter for OAuth apps.
 *
 * Called once per successful OAuth authorization or token exchange. Uses
 * a (client_id, user_id, year_month) PRIMARY KEY in `app_usage_seen` to
 * dedupe: the same user authorizing the same app five times in March
 * counts as 1 MAU, not 5.
 *
 * Because D1 doesn't have native `INSERT … ON CONFLICT DO UPDATE` with
 * RETURNING in edge-runtime, we do the dedupe in two queries:
 *   1. INSERT … ON CONFLICT DO NOTHING — succeeds only on first sight
 *   2. SELECT changes() — was a row actually inserted?
 *   3. If yes, increment the monthly counter; otherwise skip.
 *
 * Failures are best-effort: a MAU counter blip never blocks an auth.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { TIER_LIMITS, type Tier } from "./billing";

function currentYearMonthUTC(): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

/**
 * Mark a (client_id, user_id) pair active for the current month.
 * Idempotent — calling repeatedly within the same month is a no-op
 * past the first call.
 */
export async function recordMauHit(
    db: D1Database,
    clientId: string,
    userId: string,
): Promise<void> {
    if (!clientId || !userId) return;
    const ym = currentYearMonthUTC();

    try {
        // Try to claim this user as "first sight this month".
        const insertResult = await db
            .prepare(
                `INSERT INTO app_usage_seen (client_id, user_id, year_month)
                 VALUES (?, ?, ?)
                 ON CONFLICT(client_id, user_id, year_month) DO NOTHING`,
            )
            .bind(clientId, userId, ym)
            .run();

        // D1 returns `meta.changes` — 0 if the row was a duplicate, 1 if inserted.
        // Edge runtime types are loose, so accept either shape.
        const changes =
            (insertResult as any)?.meta?.changes ??
            (insertResult as any)?.changes ??
            0;
        if (changes <= 0) return; // already counted this month

        // First sight — bump the counter for (client_id, year_month).
        // UPSERT-style: insert with 1, else add 1.
        await db
            .prepare(
                `INSERT INTO app_usage_monthly (client_id, year_month, mau_count)
                 VALUES (?, ?, 1)
                 ON CONFLICT(client_id, year_month) DO UPDATE SET
                     mau_count = mau_count + 1,
                     last_updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(clientId, ym)
            .run();
    } catch (err) {
        // Never block auth on a counter failure. Surface via logs only.
        console.warn(
            "[mau] record failed for client=%s user=%s: %s",
            clientId,
            userId,
            err instanceof Error ? err.message : String(err),
        );
    }
}

/** Read the MAU count for an app this month. */
export async function getCurrentMau(
    db: D1Database,
    clientId: string,
): Promise<number> {
    const row = (await db
        .prepare(
            "SELECT mau_count FROM app_usage_monthly WHERE client_id = ? AND year_month = ?",
        )
        .bind(clientId, currentYearMonthUTC())
        .first()) as { mau_count: number } | null;
    return row?.mau_count ?? 0;
}

export type MauGateResult =
    | { allow: true; mau: number; cap: number }
    | { allow: false; mau: number; cap: number; reason: "hard_block" };

/**
 * Check whether a new MAU should be allowed for an app. Used at the
 * OAuth authorize step BEFORE recording the hit — if we'd be over the
 * hard ceiling (2× the tier cap), we refuse the authorization so the
 * over-limit user never even gets a token.
 *
 * The OWNER's tier is what matters (not the buyer's) — apps are gated
 * by who owns them, regardless of who's signing in.
 */
export async function checkMauGate(
    db: D1Database,
    clientId: string,
    ownerTier: Tier,
): Promise<MauGateResult> {
    const cap = TIER_LIMITS[ownerTier].maxMauPerApp;
    if (!Number.isFinite(cap)) {
        return { allow: true, mau: 0, cap: Number.POSITIVE_INFINITY };
    }
    const mau = await getCurrentMau(db, clientId);
    // Hard ceiling = 2× the soft cap. Gives indies a burst window
    // without immediately bouncing on a viral day; encourages an
    // upgrade conversation rather than a hard wall.
    if (mau >= cap * 2) {
        return { allow: false, mau, cap, reason: "hard_block" };
    }
    return { allow: true, mau, cap };
}
