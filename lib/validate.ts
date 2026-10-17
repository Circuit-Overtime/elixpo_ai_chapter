import { NextResponse } from 'next/server';
import {
  NSFW_SLUG_STEMS,
  RESERVED_SLUGS,
  isNsfwHostname,
  isPrivateOrUnsafeHost,
} from './denylists';

const VALID_ROLES = ['user', 'admin'] as const;
const VALID_TIERS = ['free', 'pro', 'business', 'enterprise'] as const;
const VALID_SCOPES = ['read', 'read,write'] as const;
const SAFE_PROTOCOLS = ['http:', 'https:'];

// Defensive cap. Real URLs are well under this; anything past it is
// shenanigans (encoded payloads, malformed redirects, fuzzing).
const MAX_URL_LENGTH = 2048;

/**
 * Validate a destination URL. Returns null on success, or a human-readable
 * error message. Checks:
 *
 *   - Parseable URL
 *   - http(s) protocol only
 *   - Length cap
 *   - No userinfo (no `foo:bar@example.com` style credentials)
 *   - Host is not a private / loopback / link-local IP
 *   - Host is not on the NSFW domain blocklist
 */
export function validateUrl(url: string): string | null {
  if (url.length > MAX_URL_LENGTH) {
    return `URL must be ${MAX_URL_LENGTH} characters or fewer`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  if (!SAFE_PROTOCOLS.includes(parsed.protocol)) {
    return 'URL must use http or https';
  }

  if (parsed.username || parsed.password) {
    return 'URL cannot include user credentials';
  }

  if (!parsed.hostname) {
    return 'URL must include a hostname';
  }

  if (isPrivateOrUnsafeHost(parsed.hostname)) {
    return 'URL host points to a private or loopback network';
  }

  if (isNsfwHostname(parsed.hostname)) {
    return 'URL host is on the safe-content blocklist';
  }

  return null;
}

/**
 * Normalize a slug for the NSFW check. Strips separators and folds common
 * leet substitutions so `5_lu.t`, `s|ut`, and `5lut` all collapse to `slut`
 * before we test against the wordlist.
 *
 * Not exhaustive — l33tspeak is an arms race. This catches the common
 * trivial obfuscations without claiming perfect coverage.
 */
function normalizeForNsfw(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[\s._\-|]/g, '')
    // common leet substitutions
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/!/g, 'i')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

/**
 * NSFW check: substring match against the curated stem list after
 * normalization. Catches `myporn`, `pornx`, `5lut42` — but not crafty
 * obfuscations like inserting random unicode mid-word. Pair with a real
 * wordlist if you need stronger guarantees.
 */
export function isNsfwSlug(slug: string): boolean {
  const normalized = normalizeForNsfw(slug);
  for (const stem of NSFW_SLUG_STEMS) {
    if (normalized.includes(stem)) return true;
  }
  return false;
}

/**
 * Validate a slug ("custom_code"). Returns null on success or a friendly
 * error. Used both for user-supplied custom codes and as a sanity check on
 * generated codes (so we never auto-mint a reserved/NSFW slug).
 *
 * Checks:
 *   - Alphanum + dash + underscore only
 *   - Length 3..32
 *   - Not in RESERVED_SLUGS (covers all internal routes + ambiguous shorts)
 *   - Doesn't match any NSFW stem after leet normalization
 *
 * For checking "is this slug taken by another user", do the D1 lookup in
 * the calling route — that's a different question from "is this slug
 * acceptable".
 */
export function validateSlug(slug: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return 'Slug must be alphanumeric, hyphens, or underscores';
  }
  const lengthErr = validateLength(slug, 'Slug', 3, 32);
  if (lengthErr) return lengthErr;

  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return 'That slug is reserved — try a different one';
  }

  if (isNsfwSlug(slug)) {
    return 'That slug isn\'t allowed';
  }

  return null;
}

/** Validate string length */
export function validateLength(
  value: string,
  field: string,
  min: number,
  max: number,
): string | null {
  if (value.length < min) return `${field} must be at least ${min} characters`;
  if (value.length > max) return `${field} must be at most ${max} characters`;
  return null;
}

/** Validate expires_at is in the future */
export function validateFutureDate(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Invalid date format';
  if (d <= new Date()) return 'Expiration must be in the future';
  return null;
}

/** Validate role value */
export function isValidRole(role: string): boolean {
  return (VALID_ROLES as readonly string[]).includes(role);
}

/** Validate tier value */
export function isValidTier(tier: string): boolean {
  return (VALID_TIERS as readonly string[]).includes(tier);
}

/** Validate scopes value */
export function isValidScopes(scopes: string): boolean {
  return (VALID_SCOPES as readonly string[]).includes(scopes);
}

/** Clamp a numeric query param to safe bounds */
export function clampInt(
  value: string | null,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(value || String(defaultVal));
  if (Number.isNaN(n)) return defaultVal;
  return Math.max(min, Math.min(n, max));
}

/** Return a 400 JSON error response */
export function badRequest(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 400 });
}
