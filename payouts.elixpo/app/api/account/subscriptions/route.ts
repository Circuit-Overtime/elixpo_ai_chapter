export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getSession } from "@/lib/session";

/**
 * GET /api/account/subscriptions
 *
 * The signed-in user's OWN subscriptions across every app that uses Elixpo Pay
 * — what they're paying for and the rate. Keyed by their Elixpo Accounts id
 * (session.uid), which is the `external_uid` apps charge against. This is the
 * buyer view, distinct from the merchant dashboard (what they SELL).
 */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const db = await getDatabase();
    // Pull entitlement's expires_at — it's the authoritative source of truth
    // for "when does access end". current_period_end on subscriptions is
    // only set by fulfillPayment on capture, so it can lag/miss for some
    // rows (e.g. mid-debug states). The entitlement row is upserted on
    // every grant, so its expires_at is reliable.
    const rows = ((
        await db
            .prepare(
                `SELECT s.id, s.tier, s.status, s.billing_mode,
                        s.current_period_start, s.current_period_end, s.cancel_at,
                        a.name AS app_name, a.slug AS app_slug, a.homepage_url,
                        p.name AS product_name,
                        pr.unit_amount, pr.currency, pr.interval, pr.interval_count, pr.nickname,
                        e.status AS entitlement_status, e.expires_at AS entitlement_expires
                 FROM subscriptions s
                 JOIN customers c ON s.customer_id = c.id
                 JOIN apps a ON s.app_id = a.id
                 LEFT JOIN products p ON s.product_id = p.id
                 LEFT JOIN prices pr ON s.price_id = pr.id
                 LEFT JOIN entitlements e ON e.app_id = s.app_id AND e.external_uid = c.external_uid
                 WHERE c.external_uid = ?1
                 ORDER BY
                     CASE
                         WHEN s.status = 'active' AND s.cancel_at IS NULL THEN 0
                         WHEN s.cancel_at IS NOT NULL THEN 1
                         ELSE 2
                     END,
                     COALESCE(s.current_period_end, e.expires_at, s.created_at) DESC`,
            )
            .bind(session.uid)
            .all()
    ).results ?? []) as any[];

    const now = Date.now();
    const parseTime = (s: string | null): number | null => {
        if (!s) return null;
        const t = new Date(`${s.replace(" ", "T")}Z`).getTime();
        return Number.isFinite(t) ? t : null;
    };

    const subscriptions = rows
        // Hide subscriptions that never activated AND have no useful
        // state to show (pending checkouts the buyer abandoned). They
        // pollute the list otherwise.
        .filter((r) => {
            const isPendingZombie =
                r.status === "pending" &&
                !r.cancel_at &&
                !r.current_period_end &&
                !r.entitlement_expires;
            return !isPendingZombie;
        })
        .map((r) => {
            // Effective period end — prefer the subscription's own field,
            // fall back to the entitlement's expires_at when the sub
            // row's period wasn't populated (e.g. older flows).
            const effectiveEndStr =
                r.current_period_end ?? r.entitlement_expires ?? null;
            const end = parseTime(effectiveEndStr);
            const inPeriod = end === null || end > now;
            // Cancelled state — cancel_at is set the moment the buyer
            // clicks Cancel, regardless of whether status flipped (graceful
            // cancels keep status='active' through period_end on the
            // provider side too).
            const cancelled = !!r.cancel_at;
            // True only when sub is actively renewing — not in a
            // cancellation grace period, not pending, not failed.
            const active = !cancelled && r.status === "active" && inPeriod;
            return {
                id: r.id,
                app_name: r.app_name,
                app_slug: r.app_slug,
                homepage_url: r.homepage_url,
                product_name: r.product_name,
                tier: r.tier,
                status: r.status,
                active,
                cancelled,
                cancel_at: r.cancel_at,
                billing_mode: r.billing_mode,
                current_period_end: effectiveEndStr,
                rate:
                    r.unit_amount != null
                        ? {
                              amount: r.unit_amount,
                              currency: r.currency,
                              interval: r.interval,
                              interval_count: r.interval_count,
                              nickname: r.nickname,
                          }
                        : null,
            };
        });

    return NextResponse.json(
        { subscriptions },
        { headers: { "Cache-Control": "no-store" } },
    );
}
