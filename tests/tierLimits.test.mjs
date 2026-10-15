import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, getLimits } from '../lib/tiers.js';
import { mediaInventoryCacheKey } from '../lib/cache.js';
import { PLANS } from '../lib/pricing.js';

test('free managed storage is capped at 10 MB without changing Member storage', () => {
  assert.equal(getLimits('free').totalStorageBytes, 10 * 1024 * 1024);
  assert.equal(getLimits('member').totalStorageBytes, 2 * 1024 * 1024 * 1024);
});

test('byte formatting never emits an undefined unit', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512.0 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB');
  assert.equal(formatBytes(2 * 1024 ** 4), '2048.0 GB');
  assert.equal(formatBytes(0.5), '0.5 B');
  assert.equal(formatBytes(-5), '0 B');
  assert.equal(formatBytes(NaN), '0 B');
});

test('unknown and prototype tier keys fall back to free limits', () => {
  const free = getLimits('free');
  assert.equal(getLimits('__proto__'), free);
  assert.equal(getLimits('constructor'), free);
  assert.equal(getLimits('nope'), free);
  assert.equal(getLimits('__proto__').totalStorageBytes, 10 * 1024 * 1024);
});

test('media inventory caches are private to a versioned user key', () => {
  assert.equal(mediaInventoryCacheKey('user-123'), 'v3:media-inventory:user-123');
});

test('Pollinations BYOP image generation is included in the Free plan', () => {
  const free = PLANS.find((plan) => plan.id === 'free');
  const paidPlans = PLANS.filter((plan) => plan.id !== 'free');

  assert.ok(free.features.some((feature) => feature.includes('Pollinations image generation')));
  assert.ok(paidPlans.every((plan) => !(plan.upcomingFeatures || []).some((feature) => feature.includes('Pollinations'))));
});
