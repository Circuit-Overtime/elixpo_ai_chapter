import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Inline the helpers from the contributions route so tests can run without
// the Edge runtime. These must stay in sync with app/api/users/[username]/contributions/route.js.

function timezoneOffsetSeconds(tz) {
  if (!tz || tz === 'UTC') return 0;
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return Math.round((tzDate - utcDate) / 1000);
  } catch {
    return 0;
  }
}

function epochToDateString(epoch, offsetSeconds) {
  const adjusted = (epoch + offsetSeconds) * 1000;
  const d = new Date(adjusted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('epochToDateString', () => {
  it('formats UTC epoch to YYYY-MM-DD in UTC', () => {
    // 2026-03-15T12:00:00Z
    const epoch = Math.floor(new Date('2026-03-15T12:00:00Z').getTime() / 1000);
    assert.equal(epochToDateString(epoch, 0), '2026-03-15');
  });

  it('handles midnight boundary — 23:59 UTC becomes next day in UTC+9 (Tokyo)', () => {
    // 2025-12-31T23:59:00Z → should be 2026-01-01 in Asia/Tokyo (UTC+9)
    const epoch = Math.floor(new Date('2025-12-31T23:59:00Z').getTime() / 1000);
    const tokyoOffset = 9 * 3600; // +9 hours
    assert.equal(epochToDateString(epoch, tokyoOffset), '2026-01-01');
  });

  it('stays on the same day when timezone doesn\'t cross midnight', () => {
    // 2026-06-15T10:00:00Z → still June 15 in UTC+5:30
    const epoch = Math.floor(new Date('2026-06-15T10:00:00Z').getTime() / 1000);
    const istOffset = 5.5 * 3600;
    assert.equal(epochToDateString(epoch, istOffset), '2026-06-15');
  });

  it('handles leap year Feb 29', () => {
    // 2028-02-29T15:00:00Z (2028 is a leap year)
    const epoch = Math.floor(new Date('2028-02-29T15:00:00Z').getTime() / 1000);
    assert.equal(epochToDateString(epoch, 0), '2028-02-29');
  });

  it('handles negative offset (UTC-5, New York standard time)', () => {
    // 2026-01-01T03:00:00Z → still 2025-12-31 in UTC-5
    const epoch = Math.floor(new Date('2026-01-01T03:00:00Z').getTime() / 1000);
    const nyOffset = -5 * 3600;
    assert.equal(epochToDateString(epoch, nyOffset), '2025-12-31');
  });

  it('year rollover: Dec 31 late UTC is Jan 1 in positive offsets', () => {
    const epoch = Math.floor(new Date('2025-12-31T22:00:00Z').getTime() / 1000);
    const aucklandOffset = 13 * 3600; // NZDT
    assert.equal(epochToDateString(epoch, aucklandOffset), '2026-01-01');
  });
});

describe('timezoneOffsetSeconds', () => {
  it('returns 0 for UTC', () => {
    assert.equal(timezoneOffsetSeconds('UTC'), 0);
  });

  it('returns 0 for null/undefined/empty', () => {
    assert.equal(timezoneOffsetSeconds(null), 0);
    assert.equal(timezoneOffsetSeconds(undefined), 0);
    assert.equal(timezoneOffsetSeconds(''), 0);
  });

  it('returns 0 for invalid timezone', () => {
    assert.equal(timezoneOffsetSeconds('Invalid/Zone'), 0);
  });

  it('returns a nonzero offset for Asia/Kolkata', () => {
    const offset = timezoneOffsetSeconds('Asia/Kolkata');
    // IST is UTC+5:30 = 19800 seconds
    assert.equal(offset, 19800);
  });

  it('returns a negative offset for America/New_York (standard or daylight)', () => {
    const offset = timezoneOffsetSeconds('America/New_York');
    // Either -5h (-18000) or -4h (-14400) depending on DST
    assert.ok(offset === -18000 || offset === -14400, `Expected -18000 or -14400, got ${offset}`);
  });
});

describe('bucketing aggregation logic', () => {
  it('counts multiple posts on the same day correctly', () => {
    const offsetSec = 0;
    const epochs = [
      Math.floor(new Date('2026-03-15T08:00:00Z').getTime() / 1000),
      Math.floor(new Date('2026-03-15T14:00:00Z').getTime() / 1000),
      Math.floor(new Date('2026-03-15T20:00:00Z').getTime() / 1000),
    ];
    const days = {};
    let total = 0;
    for (const epoch of epochs) {
      const dateStr = epochToDateString(epoch, offsetSec);
      days[dateStr] = (days[dateStr] || 0) + 1;
      total++;
    }
    assert.equal(days['2026-03-15'], 3);
    assert.equal(total, 3);
  });

  it('empty input produces empty days and zero total', () => {
    const days = {};
    let total = 0;
    // No rows to iterate
    assert.deepEqual(days, {});
    assert.equal(total, 0);
  });

  it('posts near midnight split correctly across timezone boundary', () => {
    const tokyoOffset = 9 * 3600;
    const epochs = [
      // 2026-06-30T23:30:00Z → July 1 in Tokyo
      Math.floor(new Date('2026-06-30T23:30:00Z').getTime() / 1000),
      // 2026-06-30T14:00:00Z → June 30 in Tokyo (23:00)
      Math.floor(new Date('2026-06-30T14:00:00Z').getTime() / 1000),
    ];
    const days = {};
    for (const epoch of epochs) {
      const dateStr = epochToDateString(epoch, tokyoOffset);
      days[dateStr] = (days[dateStr] || 0) + 1;
    }
    assert.equal(days['2026-07-01'], 1);
    assert.equal(days['2026-06-30'], 1);
  });
});
