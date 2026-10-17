import type { MetadataRoute } from 'next';

const BASE_URL = 'https://lixrl.com';

/**
 * Robots policy.
 *
 * Public marketing + docs surface is crawlable. Everything that requires
 * auth (dashboard, profile, admin) is disallowed — those pages aren't
 * useful for search and shouldn't be indexed under any user's session.
 *
 * The dynamic /{code} redirect route is also disallowed so search engines
 * don't index short links as content. Short links exist to redirect, not
 * to rank.
 *
 * The API surface is disallowed: it serves JSON / CSV and isn't meant to
 * show up in SERPs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/generate', '/pricing', '/docs', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/dashboard',
          '/dashboard/',
          '/profile',
          '/profile/',
          '/admin',
          '/admin/',
          '/login',
          // Bare short-code paths — single-segment, alphanumeric/dash/underscore.
          // Doesn't catch every shape but stops the obvious indexing path.
          '/?',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
