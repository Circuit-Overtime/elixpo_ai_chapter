// ── Elixpo Pay catalog — single source of truth ───────────────────────
// The sellable catalog (products + prices) is defined HERE in code and
// pushed to Elixpo Pay by the `pay-catalog-sync` GitHub workflow. We never
// hand-maintain price ids as env vars: ids are deterministic and prices
// derive from TIER_PRICING, so the storefront, checkout, and Pay catalog
// can never drift apart.
//
// Relative import (not `@/…`) so the sync script can run under `tsx` in CI
// without tsconfig path resolution.
import {
  type BillingCurrency,
  type BillingInterval,
  type SellableTier,
  TIER_PRICING,
} from '../types';

/** App id under your Elixpo Pay merchant. Mirrors ELIXPO_PAY_APP_ID. */
export const PAY_APP = 'lixurl';

const CURRENCIES: BillingCurrency[] = ['INR', 'USD'];
const INTERVALS: BillingInterval[] = ['monthly', 'annual'];
/** Only paid tiers are sold through Pay; `free` has no catalog entry. */
const PAID_TIERS: SellableTier[] = ['pro', 'business'];

/** Deterministic price id, e.g. `pro_inr_monthly`. Used by checkout + sync. */
export function priceId(
  tier: SellableTier,
  currency: BillingCurrency,
  interval: BillingInterval,
): string {
  return `${tier}_${currency.toLowerCase()}_${interval}`;
}

/** Pay stores interval as ('month'|'year', count) — not a day count. */
function intervalSpec(interval: BillingInterval): { interval: 'month' | 'year'; interval_count: number } {
  return interval === 'monthly'
    ? { interval: 'month', interval_count: 1 }
    : { interval: 'year', interval_count: 1 };
}

// Shapes mirror the elixpo_pay `products` / `prices` columns that /v1/sync
// maps onto: product.tier (required), price.unit_amount (minor units),
// price.interval + interval_count. `nickname` is our deterministic lookup
// label (also what checkout references).
export interface CatalogPrice {
  currency: BillingCurrency;
  unit_amount: number;
  type: 'recurring';
  interval: 'month' | 'year';
  interval_count: number;
  nickname: string;
}

export interface CatalogProduct {
  tier: SellableTier;
  name: string;
  description?: string;
  prices: CatalogPrice[];
}

export interface Catalog {
  app: string;
  products: CatalogProduct[];
}

/**
 * Build the full catalog payload POSTed to Elixpo Pay's /v1/sync. `app` is the
 * app slug (ELIXPO_PAY_APP_ID); products are keyed by `tier`.
 */
export function buildCatalog(app: string = PAY_APP): Catalog {
  const products: CatalogProduct[] = PAID_TIERS.map((tier) => ({
    tier,
    name: TIER_PRICING[tier].name,
    description: TIER_PRICING[tier].tagline,
    prices: CURRENCIES.flatMap((currency) =>
      INTERVALS.map((interval) => ({
        currency,
        unit_amount: TIER_PRICING[tier].price[currency][interval] * 100,
        type: 'recurring' as const,
        ...intervalSpec(interval),
        nickname: priceId(tier, currency, interval),
      })),
    ),
  }));
  return { app, products };
}
