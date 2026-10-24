import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActiveSeasonalTheme,
  isSeasonalThemeActive,
} from '../src/themes/seasonal/index.js';

test('has no stale seasonal theme registered after the event', () => {
  assert.equal(getActiveSeasonalTheme(new Date('2026-08-15T12:00:00.000Z')), null);
  assert.equal(getActiveSeasonalTheme(new Date('2026-08-24T12:00:00.000Z')), null);
});

test('evaluates a theme in its configured time zone', () => {
  const theme = {
    schedule: { type: 'annual', start: '08-15', end: '08-15', timeZone: 'Asia/Kolkata' },
  };
  assert.equal(isSeasonalThemeActive(theme, new Date('2026-08-14T18:30:00.000Z')), true);
  assert.equal(isSeasonalThemeActive(theme, new Date('2026-08-15T18:30:00.000Z')), false);
});

test('supports annual theme ranges that wrap across New Year', () => {
  const theme = {
    schedule: { type: 'annual', start: '12-30', end: '01-02', timeZone: 'UTC' },
  };
  assert.equal(isSeasonalThemeActive(theme, new Date('2026-12-31T12:00:00.000Z')), true);
  assert.equal(isSeasonalThemeActive(theme, new Date('2027-01-02T12:00:00.000Z')), true);
  assert.equal(isSeasonalThemeActive(theme, new Date('2027-01-03T12:00:00.000Z')), false);
});
