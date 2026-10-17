#!/usr/bin/env node

const origin = (process.env.BADGE_BACKFILL_ORIGIN || 'https://blogs.elixpo.com').replace(/\/$/, '');
const secret = process.env.BADGE_BACKFILL_SECRET || process.env.CRON_SECRET;
const requestedBatchSize = Number.parseInt(process.env.BADGE_BACKFILL_BATCH_SIZE || '5', 10);
const batchSize = Math.min(10, Math.max(1, Number.isFinite(requestedBatchSize) ? requestedBatchSize : 5));

if (!secret) {
  console.error('Set BADGE_BACKFILL_SECRET or CRON_SECRET before running this script.');
  process.exit(1);
}

let cursor = '';
let processed = 0;
let awards = 0;
let batches = 0;

while (true) {
  const response = await fetch(`${origin}/api/cron/badges-backfill`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cursor, limit: batchSize }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Backfill request failed (${response.status})`);
  }
  if (result.failures?.length) {
    console.error('Badge evaluation failures:', result.failures);
    process.exitCode = 1;
  }

  batches += 1;
  processed += result.processed || 0;
  awards += result.awards || 0;
  console.log(`Batch ${batches}: ${result.processed || 0} creators, ${result.awards || 0} new awards`);

  if (result.done) break;
  if (!result.nextCursor || result.nextCursor === cursor) {
    throw new Error('Backfill cursor did not advance.');
  }
  cursor = result.nextCursor;
}

console.log(`Backfill complete: ${processed} creators evaluated, ${awards} badges awarded.`);
