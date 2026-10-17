// Push the code-defined catalog to Elixpo Pay.
// Run by the `pay-catalog-sync` GitHub workflow (cron + on pricing changes),
// or locally: `npx tsx scripts/sync-catalog.ts`.
//
// Idempotent: a full PUT of the catalog. Re-running with unchanged pricing
// is a no-op on Pay's side; changing TIER_PRICING and merging re-syncs.
import { buildCatalog } from '../lib/billing/catalog';

async function main(): Promise<void> {
  const base = (process.env.ELIXPO_PAY_BASE_URL || 'https://payouts.elixpo.com').replace(/\/$/, '');
  const appId = process.env.ELIXPO_PAY_APP_ID;
  const apiKey = process.env.ELIXPO_PAY_API_KEY;

  if (!appId || !apiKey) {
    console.error('Missing ELIXPO_PAY_APP_ID or ELIXPO_PAY_API_KEY');
    process.exit(1);
  }

  const catalog = buildCatalog(appId);

  // POST https://payouts.elixpo.com/v1/sync — body is the catalog JSON.
  const res = await fetch(`${base}/v1/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(catalog),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Catalog sync failed (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }

  // /v1/sync returns 200 even on a per-product validation failure, with
  // ok:false + errors[]. Treat that as a hard failure so the job doesn't
  // green-check a no-op sync.
  let payload: { ok?: boolean; synced?: unknown[]; errors?: unknown[] } = {};
  try {
    payload = JSON.parse(text);
  } catch {
    console.error(`Catalog sync: unparseable response: ${text}`);
    process.exit(1);
  }
  if (payload.ok === false || (payload.errors && payload.errors.length > 0)) {
    console.error(`Catalog sync rejected: ${text}`);
    process.exit(1);
  }

  const priceCount = catalog.products.reduce((n, p) => n + p.prices.length, 0);
  console.log(`Synced ${catalog.products.length} products / ${priceCount} prices to ${base}`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
