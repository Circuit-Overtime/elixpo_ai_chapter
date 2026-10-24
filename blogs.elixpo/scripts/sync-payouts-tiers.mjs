#!/usr/bin/env node
// Push the Elixpo Pay catalog (payouts.catalog.json) to payouts.elixpo.com so it
// powers the central catalog (GET /v1/catalog?app=lixblogs). Tiers are managed
// HERE, in code — not in the payouts dashboard. Edit payouts.catalog.json, then
// run this. The actual charged amount is still chosen per-region by blogs at
// checkout; this keeps the central catalog in sync with what we sell.
//
// Usage:
//   ELIXPO_PAY_API_KEY=lix_pay_… node scripts/sync-payouts-tiers.mjs
//   (override target with PAYOUTS_SYNC_URL=http://localhost:3002)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "..", "payouts.catalog.json");

const PAYOUTS = (process.env.PAYOUTS_SYNC_URL || "https://payouts.elixpo.com").replace(/\/$/, "");
const KEY = process.env.ELIXPO_PAY_API_KEY;

if (!KEY) {
  console.error("ERROR: ELIXPO_PAY_API_KEY is not set.");
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
} catch (e) {
  console.error(`ERROR: could not read ${CATALOG_PATH}: ${e.message}`);
  process.exit(1);
}

const products = Array.isArray(catalog.products) ? catalog.products : [];
if (products.length === 0) {
  console.error("ERROR: payouts.catalog.json has no products[].");
  process.exit(1);
}

try {
  const res = await fetch(`${PAYOUTS}/v1/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ products }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ sync failed: HTTP ${res.status}`, JSON.stringify(data));
    process.exit(1);
  }
  for (const s of data.synced || []) {
    console.log(`✓ ${s.product.tier} → ${s.prices.length} price(s)` + (s.deactivated ? `, ${s.deactivated} deactivated` : ""));
  }
  for (const err of data.errors || []) {
    console.error(`✗ ${err.tier}: ${err.error} — ${err.error_description}`);
  }
  console.log(`\nSynced ${(data.synced || []).length} product(s) to ${PAYOUTS}`);
  process.exit(data.ok ? 0 : 1);
} catch (e) {
  console.error(`✗ sync error: ${e.message}`);
  process.exit(1);
}
