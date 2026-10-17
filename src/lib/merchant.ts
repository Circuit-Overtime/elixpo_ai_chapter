/**
 * Merchant resolution for the dashboard. Every SSO user maps to exactly one
 * merchant (their tenant). The first user matching ELIXPO_PAY_OWNER_EMAIL
 * claims the seeded first-party Elixpo merchant (so they immediately see the
 * blogs.elixpo billing data); everyone else gets a fresh merchant they can
 * onboard apps under — the multi-tenant SaaS path.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { getEnv } from "./env";
import { newId } from "./ids";

/**
 * The platform-owner merchant (Elixpo itself, claimed by ELIXPO_PAY_OWNER_EMAIL).
 * Its products ARE the platform's own — payments settle directly to the platform
 * Razorpay account and are NEVER split via Route. Only third-party merchants get
 * a Route payout split.
 */
export const PLATFORM_MERCHANT_ID = "mer_elixpo";

export function isPlatformMerchant(merchantId: string): boolean {
    return merchantId === PLATFORM_MERCHANT_ID;
}

/**
 * Platform commission on third-party (Route) payments, in basis points
 * (100 = 1%). Set by Elixpo — merchants do NOT control this. The split sends the
 * payment amount MINUS this cut to the merchant's linked account; the cut stays
 * with the platform. Change this one value to adjust the rate everywhere.
 */
export const PLATFORM_COMMISSION_BPS = 200; // 2%

export interface MerchantRow {
    id: string;
    name: string;
    email: string | null;
    owner_uid: string | null;
    status: string;
}

export async function getOrBootstrapMerchant(
    db: D1Database,
    uid: string,
    email: string,
    name?: string,
): Promise<MerchantRow> {
    // 1. Already linked?
    const existing = (await db
        .prepare("SELECT * FROM merchants WHERE owner_uid = ?")
        .bind(uid)
        .first()) as MerchantRow | null;
    if (existing) return existing;

    // 2. First-party owner claims the seeded Elixpo merchant if it's unclaimed.
    const ownerEmail = (await getEnv("ELIXPO_PAY_OWNER_EMAIL"))?.toLowerCase();
    if (ownerEmail && email.toLowerCase() === ownerEmail) {
        const elixpo = (await db
            .prepare("SELECT * FROM merchants WHERE id = 'mer_elixpo'")
            .first()) as MerchantRow | null;
        if (elixpo && !elixpo.owner_uid) {
            await db
                .prepare(
                    "UPDATE merchants SET owner_uid = ?, email = COALESCE(email, ?), updated_at = datetime('now') WHERE id = 'mer_elixpo'",
                )
                .bind(uid, email)
                .run();
            return { ...elixpo, owner_uid: uid };
        }
    }

    // 3. Fresh tenant for a new merchant.
    const id = newId("merchant");
    const merchantName = name || email.split("@")[0] || "New merchant";
    await db
        .prepare(
            "INSERT INTO merchants (id, name, email, owner_uid, status) VALUES (?, ?, ?, ?, 'active')",
        )
        .bind(id, merchantName, email, uid)
        .run();
    return {
        id,
        name: merchantName,
        email,
        owner_uid: uid,
        status: "active",
    };
}
