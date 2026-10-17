/**
 * Catalog sync — the single path that turns a consuming app's declared catalog
 * (a JSON file of products + regional prices) into Elixpo Pay products/prices.
 *
 * Tiers are managed FROM CODE, not the dashboard: an app pushes its catalog with
 * its secret key (see POST /v1/sync and /v1/products). Upserts a product by
 * (app, tier) and reconciles its prices by (currency, region, interval):
 * matching prices are updated, new ones inserted, and active prices missing from
 * the payload are deactivated.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { newId } from "./ids";

export const SYNC_CURRENCIES = ["INR", "USD", "EUR", "GBP"];
export const SYNC_INTERVALS = ["day", "week", "month", "year"];

export interface CatalogPriceInput {
    nickname?: string | null;
    currency: string;
    unit_amount: number;
    interval?: string;
    interval_count?: number;
    region?: string | null;
}

export interface CatalogProductInput {
    tier: string;
    name?: string;
    description?: string | null;
    /** Regional price variants. `tiers` accepted as a legacy alias. */
    prices?: CatalogPriceInput[];
    tiers?: CatalogPriceInput[];
}

export interface SyncedProduct {
    product: {
        id: string;
        name: string;
        tier: string;
        description: string | null;
    };
    prices: any[];
    deactivated: number;
}

const priceKey = (currency: string, region: string | null, interval: string) =>
    `${currency}|${region || ""}|${interval}`;

/**
 * Validate + upsert one product and reconcile its prices. Throws `SyncError`
 * with a machine code for caller-facing 4xx responses.
 */
export async function syncProduct(
    db: D1Database,
    appId: string,
    input: CatalogProductInput,
): Promise<SyncedProduct> {
    const tier = String(input.tier || "")
        .trim()
        .toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(tier)) {
        throw new SyncError(
            "invalid_tier",
            "product.tier required (a-z 0-9 _)",
        );
    }
    const name = String(input.name || tier)
        .trim()
        .slice(0, 80);
    const description = input.description
        ? String(input.description).trim().slice(0, 280)
        : null;
    const priceList = input.prices ?? input.tiers ?? [];

    // 1. Upsert the product by (app, tier).
    const existingProduct = (await db
        .prepare("SELECT id FROM products WHERE app_id = ? AND tier = ?")
        .bind(appId, tier)
        .first()) as { id: string } | null;

    let productId: string;
    if (existingProduct) {
        productId = existingProduct.id;
        await db
            .prepare(
                "UPDATE products SET name = ?, description = ?, active = 1 WHERE id = ?",
            )
            .bind(name, description, productId)
            .run();
    } else {
        productId = newId("product");
        await db
            .prepare(
                "INSERT INTO products (id, app_id, name, tier, description, active) VALUES (?, ?, ?, ?, ?, 1)",
            )
            .bind(productId, appId, name, tier, description)
            .run();
    }

    // 2. Reconcile prices.
    const existing = ((
        await db
            .prepare(
                "SELECT id, currency, region, interval, active, unit_amount, interval_count, type, provider_plan_id FROM prices WHERE product_id = ?",
            )
            .bind(productId)
            .all()
    ).results ?? []) as any[];

    const seen = new Set<string>();
    const out: any[] = [];

    for (const t of priceList) {
        const currency = String(t.currency || "").toUpperCase();
        const unit = Number(t.unit_amount);
        const interval = SYNC_INTERVALS.includes(t.interval as string)
            ? (t.interval as string)
            : "month";
        const intervalCount = Math.max(1, Number(t.interval_count || 1));
        const region = t.region
            ? String(t.region).toUpperCase().slice(0, 2)
            : null;
        const nickname = t.nickname
            ? String(t.nickname).trim().slice(0, 40)
            : null;
        if (
            !SYNC_CURRENCIES.includes(currency) ||
            !Number.isInteger(unit) ||
            unit <= 0
        ) {
            continue; // skip invalid price rows
        }
        const k = priceKey(currency, region, interval);
        seen.add(k);
        const match = existing.find(
            (e) => priceKey(e.currency, e.region, e.interval) === k,
        );
        // `type` may be 'recurring' on the input — supports per-price
        // autopay opt-in from a sync catalog JSON. `billing_mode` is an
        // alias accepted because that's the term the dashboard UI uses.
        const priceType =
            (t as any).type === "recurring" ||
            (t as any).billing_mode === "autopay"
                ? "recurring"
                : "one_time";
        if (match) {
            // A recurring price's Razorpay Plan is immutable and keyed on
            // amount + interval + interval_count. If any plan-affecting field
            // changed — or the price just became recurring — the cached
            // provider_plan_id is now stale and would keep charging the old
            // amount. Drop it so a fresh Plan is minted on the next checkout
            // (see ensurePlanForPrice). Currency/region/interval are part of
            // the match key, so they can't change on an update.
            const planStale =
                priceType === "recurring" &&
                (Number(match.unit_amount) !== unit ||
                    Number(match.interval_count) !== intervalCount ||
                    match.type !== "recurring");

            // Also reconcile `type` on existing rows so an owner can flip
            // a price between one_time ↔ autopay by re-syncing the catalog.
            await db
                .prepare(
                    `UPDATE prices SET unit_amount = ?, nickname = ?, interval_count = ?, type = ?, active = 1${
                        planStale ? ", provider_plan_id = NULL" : ""
                    } WHERE id = ?`,
                )
                .bind(unit, nickname, intervalCount, priceType, match.id)
                .run();
            out.push({
                id: match.id,
                currency,
                unit_amount: unit,
                type: priceType,
                interval,
                region,
                updated: true,
                plan_reset: planStale,
            });
        } else {
            const pid = newId("price");
            await db
                .prepare(
                    `INSERT INTO prices (id, product_id, nickname, currency, unit_amount, type, interval, interval_count, region, provider, active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'razorpay', 1)`,
                )
                .bind(
                    pid,
                    productId,
                    nickname,
                    currency,
                    unit,
                    priceType,
                    interval,
                    intervalCount,
                    region,
                )
                .run();
            out.push({
                id: pid,
                currency,
                unit_amount: unit,
                interval,
                region,
                created: true,
            });
        }
    }

    // 3. Deactivate active prices not present in the payload.
    let deactivated = 0;
    for (const e of existing) {
        if (e.active && !seen.has(priceKey(e.currency, e.region, e.interval))) {
            await db
                .prepare("UPDATE prices SET active = 0 WHERE id = ?")
                .bind(e.id)
                .run();
            deactivated++;
        }
    }

    return {
        product: { id: productId, name, tier, description },
        prices: out,
        deactivated,
    };
}

/** Caller-facing sync error with a stable machine code. */
export class SyncError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}
