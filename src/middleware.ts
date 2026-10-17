import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|images).*)'],
};

export async function middleware(request: NextRequest) {
  // Allow the landing page to be publicly accessible
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next();
  }

  // --- DEV MODE BYPASS ---
  if (process.env.DEV_SKIP_AUTH === 'true') {
    const response = NextResponse.next();
    response.headers.set('x-user-id', 'dev-user-local');
    return response;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith("elixpo_session="));

  if (!match) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  try {
    const sessionStr = decodeURIComponent(match.split("=").slice(1).join("="));
    const session = JSON.parse(sessionStr);

    if (!session || !session.accessToken) {
      return NextResponse.redirect(new URL('/api/auth/login', request.url));
    }

    return NextResponse.next();
  } catch {
    // Session invalid or expired — redirect to login
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }
}
