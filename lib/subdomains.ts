import type { Tier } from './types';
import { TIER_LIMITS } from './types';

export const SUBDOMAIN_BASE = 'lixrl.com';
export const VERIFICATION_TTL_SECONDS = 30 * 60;

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const RESERVED_LABELS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cdn', 'dashboard', 'docs',
  'help', 'links', 'login', 'mail', 'pay', 'payouts', 'pricing', 'privacy',
  'report', 'security', 'static', 'status', 'support', 'terms', 'www',
]);

export function normalizeSubdomainLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateSubdomainLabel(value: unknown): string | null {
  const label = normalizeSubdomainLabel(value);
  if (!label) return 'Subdomain is required';
  if (label.length < 3 || label.length > 32) return 'Subdomain must be 3–32 characters';
  if (label.includes('.') || !LABEL_PATTERN.test(label)) {
    return 'Use lowercase letters, numbers, and interior hyphens only';
  }
  if (label.startsWith('xn--')) return 'Internationalized labels are not supported';
  if (RESERVED_LABELS.has(label)) return 'This subdomain is reserved';
  return null;
}

export function subdomainHostname(label: string): string {
  return `${normalizeSubdomainLabel(label)}.${SUBDOMAIN_BASE}`;
}

export function subdomainEntitlement(tier: Tier): number {
  return TIER_LIMITS[tier].brandedDomains;
}

export function hasSubdomainEntitlement(tier: Tier): boolean {
  return subdomainEntitlement(tier) !== 0;
}

export function subdomainRedirectCacheKey(
  subdomainId: number,
  revision: number,
  code: string,
): string {
  return `subdomain:${subdomainId}:r${revision}:url:${code.toLowerCase()}`;
}

export function generateVerificationToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function verificationExpiry(): string {
  return new Date(Date.now() + VERIFICATION_TTL_SECONDS * 1000).toISOString();
}
