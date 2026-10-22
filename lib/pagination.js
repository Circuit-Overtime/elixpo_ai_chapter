// Paging params arrive as raw query strings and are bound straight into
// LIMIT / OFFSET. SQLite reads a negative LIMIT as "no limit" and D1 rejects
// NaN, so every value is clamped into range before it reaches a query.
// Non-numeric input falls back to the route's default instead of failing.

// Keeps (page - 1) * limit a safe integer and bounds how deep a scan can go.
export const MAX_PAGE = 10_000;
export const MAX_OFFSET = 500_000;

function parseInteger(value) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseLimit(value, fallback, max) {
  const n = parseInteger(value);
  return n === null ? fallback : Math.min(Math.max(n, 1), max);
}

export function parsePage(value) {
  const n = parseInteger(value);
  return n === null ? 1 : Math.min(Math.max(n, 1), MAX_PAGE);
}

export function parseOffset(value) {
  const n = parseInteger(value);
  return n === null ? 0 : Math.min(Math.max(n, 0), MAX_OFFSET);
}
