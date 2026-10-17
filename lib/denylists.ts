/**
 * Denylists for slugs and URLs.
 *
 * The "bloom filter" the team asked for is fundamentally what a Set lookup is:
 * O(1) check against a known-bad list before a DB round-trip. For our scale
 * (well under a million slugs in a single isolate), an in-memory Set is
 * strictly better than an actual bloom filter — no false positives, faster,
 * easier to reason about. We add a real bloom filter only when this list
 * grows past what a worker isolate can comfortably hold.
 */

// ── Reserved slugs ─────────────────────────────────────────────────────────
// Anything that could collide with an internal route. Keep this conservative —
// false positives only mean "ask the user for a different slug", not data loss.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Top-level Next routes
  'about',
  'admin',
  'api',
  'app',
  'cli',
  'dashboard',
  'docs',
  'generate',
  'login',
  'logout',
  'not-found',
  'pricing',
  'privacy',
  'profile',
  'public',
  'static',
  'settings',
  'terms',
  // Legacy public routes remain reserved after redirects or renames.
  'qr-code-generator',
  'report',
  // Common reserved auth / admin paths
  'administrator',
  'auth',
  'authorize',
  'authentication',
  'callback',
  'oauth',
  'sso',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'register',
  'verify',
  'verification',
  'password',
  'reset',
  'forgot',
  // Operational
  'health',
  'healthz',
  'status',
  'metrics',
  'monitoring',
  'ping',
  'robots',
  'robots.txt',
  'sitemap',
  'sitemap.xml',
  'favicon',
  'favicon.ico',
  '.well-known',
  // Branding-collision
  'elixpo',
  'elixpourl',
  'url',
  'shortener',
  // Common file extensions / paths attackers probe
  'wp-admin',
  'wp-login',
  'phpmyadmin',
  'env',
  '.env',
  'config',
  // Very short ambiguous slugs
  'a',
  'b',
  'c',
  'me',
  'go',
  'on',
  'in',
  'at',
  'is',
  'it',
  'to',
  'or',
  'of',
]);

// ── NSFW / profanity (slugs) ───────────────────────────────────────────────
// Curated baseline only. The l33tspeak normalizer in `validate.ts` runs the
// slug through `nsfwSlugCheck` so 5h17, sh!t, f.u.c.k all collapse to the
// canonical form before we test against this list.
//
// This is a STARTER list. For production you'll want a fuller wordlist
// (LDNOOBW or similar). Don't import a huge list here — it bloats the edge
// bundle. Keep this curated and expand deliberately.
export const NSFW_SLUG_STEMS: ReadonlySet<string> = new Set([
  // Sexual
  'porn', 'porno', 'xxx', 'sex', 'nude', 'naked', 'nsfw', 'fuck', 'shit',
  'cunt', 'cock', 'dick', 'pussy', 'tits', 'boobs', 'anal', 'milf',
  'hentai', 'rape', 'incest', 'orgy', 'fetish', 'bdsm', 'slut', 'whore',
  // Slurs (truncated — keep these tightly held)
  'nigger', 'nigga', 'faggot', 'tranny', 'retard', 'spic', 'kike', 'chink',
  // Violence / self-harm
  'kill', 'murder', 'suicide', 'killyourself', 'kys',
  // Drugs (illegal in most jurisdictions)
  'meth', 'crack', 'heroin', 'cocaine', 'fentanyl',
]);

// ── NSFW domains (URLs) ────────────────────────────────────────────────────
// Hostname-suffix denylist. We check the full hostname + every parent (so a
// match on `example.com` blocks `sub.example.com` too). Keep this short —
// for serious coverage, use Cloudflare Gateway / a hosted DNS feed.
export const NSFW_HOSTNAME_SUFFIXES: ReadonlySet<string> = new Set([
  'pornhub.com',
  'xvideos.com',
  'xnxx.com',
  'redtube.com',
  'youporn.com',
  'xhamster.com',
  'spankbang.com',
  'chaturbate.com',
  'onlyfans.com',
  'manyvids.com',
  'stripchat.com',
  'livejasmin.com',
  'rule34.xxx',
  'e-hentai.org',
  'nhentai.net',
]);

// ── Private / unsafe IP ranges (URL hosts) ─────────────────────────────────
// Block redirects to internal networks, loopback, and link-local. Prevents
// using our shortener as an SSRF proxy or to point at developer machines.
export function isPrivateOrUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Loopback / localhost names
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan'))
    return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1') return true;

  // IPv4 literals
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;// 100.64.0.0/10 CGNAT
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a >= 224) return true;                       // multicast + reserved
    return false;
  }

  // IPv6 literals — coarse check for unique-local and link-local prefixes
  if (h.includes(':')) {
    if (h.startsWith('fc') || h.startsWith('fd')) return true;  // fc00::/7 ULA
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb'))
      return true;  // fe80::/10 link-local
  }

  return false;
}

export function isNsfwHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  // Check the host and every parent domain (so `sub.pornhub.com` matches).
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (NSFW_HOSTNAME_SUFFIXES.has(candidate)) return true;
  }
  return false;
}
