export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

/**
 * Sync the canonical accounts.elixpo tier catalog to payouts.elixpo.
 *
 * Auth (one of):
 *   Authorization: Bearer <CRON_SECRET>
 *   ?key=<CRON_SECRET>
 *
 * Single source of truth: the TIER_CATALOG constant below. Edit it, redeploy,
 * trigger this endpoint (manually or on a cron schedule), and payouts.elixpo's
 * product/price rows reconcile to match.
 *
 * Idempotent — calling repeatedly with the same catalog is a no-op past the
 * first run (payouts.elixpo's /v1/sync upserts by (app, tier) and
 * (currency, region, interval)).
 *
 * Test prices (₹1 / ₹2) are intentional while we validate autopay end-to-end.
 * Once verified, bump the unit_amount values to the real INR prices and
 * rerun this cron.
 */

interface PriceDef {
    nickname?: string;
    currency: string;
    /** Minor units (paise). 100 = ₹1. */
    unit_amount: number;
    interval: "day" | "week" | "month" | "year";
    interval_count?: number;
    region?: string;
    /** 'recurring' = autopay mandate. 'one_time' = manual purchase. */
    type: "recurring" | "one_time";
}

interface ProductDef {
    tier: string;
    name: string;
    description: string;
    prices: PriceDef[];
}

const TIER_CATALOG: ProductDef[] = [
    {
        tier: "indie",
        name: "Indie",
        description:
            "Ship real products to real users — 10k MAU per app, 10 apps, 5 webhook endpoints.",
        prices: [
            {
                nickname: "India · Monthly",
                currency: "INR",
                unit_amount: 159900, // ₹1,599 — production
                interval: "month",
                interval_count: 1,
                type: "recurring",
            },
        ],
    },
    {
        tier: "studio",
        name: "Studio",
        description:
            "For studios shipping at scale — 100k MAU per app, unlimited apps, audit log export.",
        prices: [
            {
                nickname: "India · Monthly",
                currency: "INR",
                unit_amount: 829900, // ₹8,299 — production
                interval: "month",
                interval_count: 1,
                type: "recurring",
            },
        ],
    },
];

async function handle(request: NextRequest) {
    // Single shared secret — the same value gates the inbound trigger
    // (GH workflow Bearer → here) AND authenticates the outbound call to
    // payouts.elixpo. See ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET in
    // .env.local / CF Pages env / GH repo secrets — all three platforms
    // hold the same string.
    const secret = process.env.ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET;
    if (!secret) {
        return NextResponse.json(
            {
                error: "cron_unconfigured",
                error_description:
                    "ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET not set",
            },
            { status: 500 },
        );
    }
    const presented =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        request.nextUrl.searchParams.get("key") ||
        "";
    if (!constantTimeEquals(presented, secret)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const apiBase =
        process.env.PAYOUTS_API_BASE || "https://payouts.elixpo.com";
    // Same secret used here as the outbound API key — it IS the payouts
    // app client secret, so doubling it as the trigger gate is fine: any
    // request that knows this string is allowed to talk to payouts on our
    // behalf either way.
    const apiKey = secret;

    // Sync each product one by one. /v1/sync takes a single product OR the
    // `{products: [...]}` wrapper. We use the wrapper form so the response
    // covers the whole catalog in one request.
    const body = {
        app: {
            homepage_url: "https://accounts.elixpo.com",
            pricing_url: "https://accounts.elixpo.com/pricing",
        },
        products: TIER_CATALOG,
    };

    let resp: Response;
    try {
        resp = await fetch(`${apiBase}/v1/sync`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        console.error(
            "[sync-tiers] payouts unreachable: %s",
            err instanceof Error ? err.message : String(err),
        );
        return NextResponse.json(
            { error: "upstream_unreachable" },
            { status: 502 },
        );
    }

    const text = await resp.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 500) };
    }

    if (!resp.ok) {
        console.error(
            "[sync-tiers] payouts /v1/sync failed status=%s err=%s",
            String(resp.status),
            data?.error_description || data?.error || "unknown",
        );
        return NextResponse.json(
            {
                error: "sync_failed",
                error_description:
                    data?.error_description ||
                    data?.error ||
                    `HTTP ${resp.status}`,
                upstream: data,
            },
            { status: 502 },
        );
    }

    return NextResponse.json({
        ok: true,
        catalog_size: TIER_CATALOG.length,
        upstream: data,
    });
}

function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function POST(request: NextRequest) {
    return handle(request);
}

export async function GET(request: NextRequest) {
    return handle(request);
}
