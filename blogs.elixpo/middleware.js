import { NextResponse } from 'next/server';

// Auth-gated routes enter the server-initiated OAuth flow directly. LixBlogs
// never renders a credential-entry page; accounts.elixpo.com owns authentication.
const PROTECTED_PATHS = ['/settings', '/new-blog', '/notifications', '/edit', '/intro', '/library', '/stats'];
const NOINDEX_PATHS = [...PROTECTED_PATHS, '/profile', '/stories', '/callback', '/auth-error', '/org/join'];

const pathMatches = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

// All known app route prefixes — anything NOT in this set gets treated as a profile/blog handle
const APP_ROUTES = new Set([
  'about', 'api', 'callback', 'edit', 'explore', 'feed', 'handle', 'intro', 'library',
  'login', 'new-blog', 'notifications', 'profile', 'pricing', 'register', 'settings',
  'sign-in', 'sign-up', 'stats', 'stories', 'org',
  'help', 'docs', 'privacy', 'terms',
  'tag', 'auth-error',
  'feed.xml', 'sitemap.xml', 'robots.txt',
  '_next', 'favicon.ico', 'logo.png', 'logo-dark.png', 'logo-light.png', 'base-logo.png',
]);

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Get the first path segment (e.g. /elixpo/slug → "elixpo")
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] || '';

  // Dynamic handle routes are now served by app/[...path]/page.jsx directly
  // (no middleware rewrite needed)

  // Auth protection
  const noindex = NOINDEX_PATHS.some((p) => pathMatches(pathname, p));
  const isProtected = PROTECTED_PATHS.some((p) => pathMatches(pathname, p));
  if (isProtected) {
    const session = request.cookies.get('lixblogs_session')?.value;
    if (!session) {
      const signIn = new URL('/api/auth/login', request.url);
      signIn.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(signIn);
      redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return redirect;
    }
  }

  const response = NextResponse.next();
  if (noindex) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  // Reader/profile HTML references deployment-hashed Next chunks. Never cache
  // this document across releases or it can point at a chunk from an older
  // deployment and fail with a text/html MIME mismatch.
  if (firstSegment && !APP_ROUTES.has(firstSegment) && !firstSegment.startsWith('_')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/).*)'],
};
