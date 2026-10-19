import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREATOR_BADGES, badgeProgress, longestConsecutiveWeeks } from '../lib/badgeDefinitions.js';

const badgeDirectory = fileURLToPath(new URL('../public/badges/', import.meta.url));

test('creator badge catalogue has 25 stable unique identifiers', () => {
  assert.equal(CREATOR_BADGES.length, 25);
  assert.equal(new Set(CREATOR_BADGES.map((badge) => badge.id)).size, 25);
  for (const badge of CREATOR_BADGES) {
    assert.match(badge.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(badge.artwork, `/badges/${badge.id}.webp`);
  }
});

test('every catalogue entry has one optimized production artwork asset', () => {
  const expected = CREATOR_BADGES.map((badge) => `${badge.id}.webp`).sort();
  const actual = readdirSync(badgeDirectory).filter((name) => name.endsWith('.webp')).sort();
  assert.deepEqual(actual, expected);
  for (const badge of CREATOR_BADGES) {
    const path = `${badgeDirectory}${badge.id}.webp`;
    assert.equal(existsSync(path), true, `${badge.id} artwork is missing`);
    assert.ok(statSync(path).size <= 20_000, `${badge.id} artwork is not optimized`);
  }
});

test('manual badges are never automatically earned', () => {
  const staffPick = CREATOR_BADGES.find((badge) => badge.id === 'staff-pick');
  assert.deepEqual(badgeProgress(staffPick, {}), { value: 0, target: null, earned: false });
});

test('badge progress reaches a threshold exactly', () => {
  const firstLight = CREATOR_BADGES.find((badge) => badge.id === 'first-light');
  assert.equal(badgeProgress(firstLight, { publishedStories: 0 }).earned, false);
  assert.equal(badgeProgress(firstLight, { publishedStories: 1 }).earned, true);
});

test('weekly streaks ignore duplicates and stop at gaps', () => {
  assert.equal(longestConsecutiveWeeks([105, 106, 106, 107, 110, 111]), 3);
  assert.equal(longestConsecutiveWeeks([]), 0);
});
