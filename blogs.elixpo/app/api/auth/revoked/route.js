export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { clearSession } from '../../../../lib/auth';

// Return landing for users coming back from accounts.elixpo after revoking the
// "blogs" app. The data purge itself happens server-to-server via the
// account-revoked webhook; this endpoint just clears the local session cookie
// so the user is visibly signed out. See GitHub issue #8.
export async function GET(request) {
  await clearSession();
  return NextResponse.redirect(new URL('/?revoked=1', request.url));
}
