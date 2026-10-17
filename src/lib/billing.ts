/**
 * Billing helpers — verify payouts.elixpo webhooks and apply tier changes.
 *
 * payouts.elixpo signs outbound webhooks like:
 *   X-Elixpo-Pay-Timestamp: <unix_seconds>
 *   X-Elixpo-Pay-Signature: sha256=<hex>,sha256=<hex>   (comma-separated;
 *                                                       any match passes)
 *   HMAC input: `${timestamp}.${rawBody}` over PAYOUTS_WEBHOOK_SECRET
 *
 * Tier model:
 *   hobby     — default. No subscription.
 *   indie     — paid. From Pay product/tier mapped via PAY_TIER_INDIE.
 *   studio    — paid.
 *   internal  — admin/team. Set out-of-band; never via webhook.
 *
 * The `tier` field on the inbound entitlement event is the Pay product's
 * tier slug. We accept it as-is when it matches one of our known paid
 * tiers; anything unknown is treated as 'hobby' (graceful downgrade).
 */

import type { D1Database } from "@cloudflare/workers-types";

/** Constant-time hex string comparison. Returns false on length mismatch
 *  without leaking either value's length via early return. */
function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Tiers users can hold. Order matters for upgrade comparisons. */
export type Tier = "hobby" | "indie" | "studio" | "internal";

const KNOWN_PAID_TIERS = new Set<Tier>(["indie", "studio"]);

/**
 * Per-tier feature limits. Source of truth for tier enforcement; the
 * /pricing page copy reflects these. Update both when changing limits.
 *
 * `Infinity` means "no enforced cap" — internal + studio get unlimited
 * OAuth apps and webhook endpoints in v1.
 */
export interface TierLimits {
    /** Max OAuth apps an owner can hold simultaneously. */
    maxOAuthApps: number;
    /** Max webhook endpoints per OAuth app. */
    maxWebhookEndpointsPerApp: number;
    /** Soft cap on MAU per app — UI warns at 80%, hard-blocks at 200%. */
    maxMauPerApp: number;
    /** Days that failed-webhook retries stay in the queue. */
    webhookRetryDays: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
    hobby: {
        maxOAuthApps: 3,
        maxWebhookEndpointsPerApp: 1,
        maxMauPerApp: 1_000,
        webhookRetryDays: 7,
    },
    indie: {
        maxOAuthApps: 10,
        maxWebhookEndpointsPerApp: 5,
        maxMauPerApp: 10_000,
        webhookRetryDays: 30,
    },
    studio: {
        maxOAuthApps: Number.POSITIVE_INFINITY,
        maxWebhookEndpointsPerApp: Number.POSITIVE_INFINITY,
        maxMauPerApp: 100_000,
        webhookRetryDays: 30,
    },
    internal: {
        maxOAuthApps: Number.POSITIVE_INFINITY,
        maxWebhookEndpointsPerApp: Number.POSITIVE_INFINITY,
        maxMauPerApp: Number.POSITIVE_INFINITY,
        webhookRetryDays: 30,
    },
};

/** Read the tier off a users row, normalising missing/legacy values to 'hobby'. */
export function tierFromUserRow(
    row: { tier?: string | null; is_internal?: number | boolean } | null,
): Tier {
    if (!row) return "hobby";
    if (row.is_internal === 1 || row.is_internal === true) return "internal";
    return normalizeTier(row.tier);
}

export function normalizeTier(raw: string | null | undefined): Tier {
    if (!raw) return "hobby";
    const t = raw.trim().toLowerCase();
    if (KNOWN_PAID_TIERS.has(t as Tier)) return t as Tier;
    return "hobby";
}

/**
 * Verify the X-Elixpo-Pay-Signature header against a raw body.
 *
 * The header carries one or more `sha256=<hex>` values separated by commas.
 * We compute the expected hex against PAYOUTS_WEBHOOK_SECRET (the secret
 * the merchant configured on payouts.elixpo when registering the endpoint)
 * and accept if ANY presented value matches — supports key rotation where
 * Pay signs with both the current and previous secret during the grace
 * window.
 */
export async function verifyPayoutsSignature(
    rawBody: string,
    timestampHeader: string | null,
    signatureHeader: string | null,
    secret: string,
): Promise<boolean> {
    if (!timestampHeader || !signatureHeader || !secret) return false;
    // Reject timestamps outside ±5 minutes — bounds replay window if a
    // signature ever leaks. Pay's deliveries should arrive within seconds.
    const t = Number.parseInt(timestampHeader, 10);
    if (!Number.isFinite(t)) return false;
    const skew = Math.abs(Math.floor(Date.now() / 1000) - t);
    if (skew > 300) return false;

    const expected = await hmacSha256Hex(
        secret,
        `${timestampHeader}.${rawBody}`,
    );
    const presented = signatureHeader
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.startsWith("sha256="))
        .map((s) => s.slice("sha256=".length));

    for (const candidate of presented) {
        if (timingSafeEqualHex(expected, candidate)) return true;
    }
    return false;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message),
    );
    let out = "";
    for (const b of new Uint8Array(sig)) out += b.toString(16).padStart(2, "0");
    return out;
}

/**
 * Apply an entitlement.updated event to the users row.
 *
 * Returns the previous tier (so callers can decide whether to fire the
 * "subscription activated" email — we only email on UPGRADES, not on
 * silent renewals where the tier stayed the same).
 *
 * Also manages the `tier_cancelled_at` marker so the dashboard can
 * render the right state for graceful cancels:
 *   - `cancelled` event           → set tier_cancelled_at = now()
 *   - hobby → paid transition     → clear tier_cancelled_at (new sub)
 *   - paid → hobby (period ended) → clear tier_cancelled_at (cycle done)
 */
export async function applyEntitlementUpdate(
    db: D1Database,
    params: {
        userId: string;
        tier: Tier;
        expiresAt: string | null;
        providerSubscriptionId: string | null;
        /** Webhook payload's `data.status`. Used to set cancelled marker. */
        eventStatus?: string | null;
    },
): Promise<{ previousTier: Tier; nextTier: Tier }> {
    const row = (await db
        .prepare("SELECT tier, is_internal FROM users WHERE id = ?")
        .bind(params.userId)
        .first()) as { tier: string; is_internal: number } | null;

    const previousTier = (row?.tier ?? "hobby") as Tier;

    // Never overwrite is_internal users' tier via inbound webhook — those
    // accounts skip billing entirely. The webhook event is still recorded
    // in billing_events for audit but the row isn't touched.
    if (row?.is_internal) {
        return { previousTier: "internal", nextTier: "internal" };
    }

    // Decide tier_cancelled_at:
    //   - status='cancelled' (our cancel API, or Razorpay terminal cancel)
    //     OR status='halted' (UPI mandate revoked from the buyer's GPay/
    //     PhonePe app, or repeated charge failures — either way the
    //     sub will not renew) → mark now. Treating halted the same
    //     way bridges the "buyer cancelled in their UPI app, our site
    //     never knew" gap: the dashboard reflects cancellation
    //     immediately regardless of where the cancel was triggered.
    //   - hobby→paid (new sub starting) → clear (fresh cycle)
    //   - paid→hobby (period_end downgrade) → clear (cycle finished)
    //   - everything else (renewal, no-op) → preserve existing value
    let cancelledAtClause = "tier_cancelled_at = tier_cancelled_at"; // no-op
    if (params.eventStatus === "cancelled" || params.eventStatus === "halted") {
        cancelledAtClause = "tier_cancelled_at = datetime('now')";
    } else if (previousTier === "hobby" && params.tier !== "hobby") {
        cancelledAtClause = "tier_cancelled_at = NULL";
    } else if (previousTier !== "hobby" && params.tier === "hobby") {
        cancelledAtClause = "tier_cancelled_at = NULL";
    }

    await db
        .prepare(
            `UPDATE users
             SET tier = ?, tier_renews_at = ?, tier_provider_subscription_id = ?,
                 ${cancelledAtClause}
             WHERE id = ?`,
        )
        .bind(
            params.tier,
            params.expiresAt,
            params.providerSubscriptionId,
            params.userId,
        )
        .run();

    return { previousTier, nextTier: params.tier };
}
