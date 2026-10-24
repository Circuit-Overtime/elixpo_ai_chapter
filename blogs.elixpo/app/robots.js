export const runtime = 'edge';

const SITE_URL = 'https://blogs.elixpo.com';

// Single source for /robots.txt. A static public/robots.txt used to sit beside
// this file with different rules; only this route was served, so its /api/
// block never applied.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      // OG cards live under /api/og. Social crawlers honor robots.txt, so the
      // narrower allow must win over the /api/ block or link previews break.
      allow: ['/', '/api/og'],
      disallow: [
        '/api/',
        '/edit/',
        '/new-blog',
        '/settings',
        '/notifications',
        '/library',
        '/profile',
        '/stories',
        '/stats',
        '/intro',
        '/org/join/',
        '/sign-in',
        '/sign-up',
        '/login',
        '/register',
        '/auth-error',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
