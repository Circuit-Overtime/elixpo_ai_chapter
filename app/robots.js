export const runtime = 'edge';

const SITE_URL = 'https://blogs.elixpo.com';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/edit/',
        '/new-blog',
        '/settings',
        '/notifications',
        '/library',
        '/profile',
        '/stories',
        '/stats',
        '/intro',
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
