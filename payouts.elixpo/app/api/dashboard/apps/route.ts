export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { sha256Hex } from "@/lib/crypto";
import { requireDashboard } from "@/lib/dashboard-auth";
import { newId } from "@/lib/ids";

/** GET /api/dashboard/apps — list the merchant's apps. */
export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const apps = await db
        .prepare(
            `SELECT a.id, a.slug, a.name, a.description, a.homepage_url, a.pricing_url,
                    a.return_url, a.status, a.created_at,
                    (a.api_key_hash IS NOT NULL) AS has_key,
                    (SELECT COUNT(*) FROM products p WHERE p.app_id = a.id AND p.active = 1) AS products
             FROM apps a WHERE a.merchant_id = ? ORDER BY a.created_at`,
        )
        .bind(merchantId)
        .all();

    return NextResponse.json({ apps: apps.results ?? [] });
}

/** Turn a display name into a stable, URL-safe slug. */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 38);
}

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
    let candidate = base.length >= 3 ? base : `${base}-app`.slice(0, 38);
    for (let i = 0; i < 6; i++) {
        const taken = await db
            .prepare("SELECT 1 FROM apps WHERE slug = ?")
            .bind(candidate)
            .first();
        if (!taken) return candidate;
        const suffix = crypto.randomUUID().slice(0, 4);
        candidate = `${base.slice(0, 33)}-${suffix}`;
    }
    return `app-${crypto.randomUUID().slice(0, 8)}`;
}

function validUrl(u: unknown): string | null {
    if (!u) return null;
    try {
        const url = new URL(String(u));
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.toString();
    } catch {
        return null;
    }
}

/**
 * POST /api/dashboard/apps — register an app. The slug is derived from the name
 * automatically (it's the immutable API identifier); merchants supply the
 * human-facing name, description, homepage URL and pricing URL. Returns the
 * secret key ONCE.
 */
export async function POST(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const body: any = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const description = body.description
        ? String(body.description).trim().slice(0, 280)
        : null;

    if (name.length < 2) {
        return NextResponse.json(
            {
                error: "invalid_name",
                error_description: "App name must be at least 2 characters.",
            },
            { status: 400 },
        );
    }

    // Homepage may be http (app not deployed yet) or https — just well-formed.
    const homepageUrl = validUrl(body.homepage_url);
    if (body.homepage_url && !homepageUrl) {
        return NextResponse.json(
            { error: "invalid_homepage_url" },
            { status: 400 },
        );
    }

    // Pricing page must be https AND actually reachable (2xx). Otherwise we
    // silently keep it empty rather than blocking app creation.
    const pricingUrl = await verifiedHttpsUrl(body.pricing_url);

    const slug = await uniqueSlug(db, slugify(name));

    // Client credentials: slug is the public Client ID; the secret is shown once.
    const clientSecret = `lix_pay_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const secretHash = await sha256Hex(clientSecret);
    const id = newId("app");

    await db
        .prepare(
            `INSERT INTO apps (id, merchant_id, slug, name, description, homepage_url, pricing_url, api_key_hash, return_url, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        )
        .bind(
            id,
            merchantId,
            slug,
            name,
            description,
            homepageUrl,
            pricingUrl,
            secretHash,
            pricingUrl,
        )
        .run();

    // 1 app = 1 product: auto-create the app's product so it's sellable at once.
    const productId = newId("product");
    await db
        .prepare(
            "INSERT INTO products (id, app_id, name, tier, description, active) VALUES (?, ?, ?, 'default', ?, 1)",
        )
        .bind(productId, id, name, description)
        .run();

    // Optional initial price (the product's sell price).
    let price: any = null;
    const p = body.price;
    if (
        p &&
        CURRENCIES.includes(String(p.currency).toUpperCase()) &&
        Number.isInteger(p.unit_amount) &&
        p.unit_amount > 0
    ) {
        const interval = INTERVALS.includes(p.interval) ? p.interval : "month";
        const intervalCount = Math.max(1, Number(p.interval_count || 1));
        // `type` selects one-time vs autopay. Accept 'recurring' as an
        // alias for autopay so the JSON contract matches the underlying
        // schema column. Default: 'one_time' (backward-compatible).
        const priceType =
            p.type === "recurring" || p.billing_mode === "autopay"
                ? "recurring"
                : "one_time";
        const priceId = newId("price");
        await db
            .prepare(
                `INSERT INTO prices (id, product_id, currency, unit_amount, type, interval, interval_count, provider, active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'razorpay', 1)`,
            )
            .bind(
                priceId,
                productId,
                String(p.currency).toUpperCase(),
                p.unit_amount,
                priceType,
                interval,
                intervalCount,
            )
            .run();
        price = {
            id: priceId,
            currency: String(p.currency).toUpperCase(),
            unit_amount: p.unit_amount,
            type: priceType,
            interval,
            interval_count: intervalCount,
        };
    }

    return NextResponse.json({
        app: {
            id,
            slug,
            name,
            description,
            homepage_url: homepageUrl,
            pricing_url: pricingUrl,
        },
        product_id: productId,
        price,
        client_id: slug,
        client_secret: clientSecret, // shown once
    });
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const INTERVALS = ["day", "week", "month", "year"];

/** Returns the URL only if it's https and responds 2xx; else null (kept empty). */
async function verifiedHttpsUrl(input: unknown): Promise<string | null> {
    const u = validUrl(input);
    if (!u || !u.startsWith("https://")) return null;
    try {
        const res = await fetch(u, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
        });
        return res.ok ? u : null;
    } catch {
        return null;
    }
}
