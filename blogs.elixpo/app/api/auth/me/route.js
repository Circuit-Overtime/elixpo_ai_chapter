export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getOAuthConfig, getSession } from '../../../../lib/auth';

export async function GET() {
  const session = await getSession();

  if (!session || !session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let dbReached = false;
  try {
    const { kvCache } = await import('../../../../lib/cache');
    const user = await kvCache(`v1:user:${session.userId}`, 300, async () => {
      const { getDB } = await import('../../../../lib/cloudflare');
      const db = getDB();
      dbReached = true;

      // Best-effort reconciliation covers missed/retried webhooks and existing
      // sessions created before username propagation was implemented. This runs
      // only on the five-minute profile-cache miss, not on every client request.
      if (session.accessToken) {
        try {
          const upstream = await fetch(getOAuthConfig().userInfoUrl, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });
          if (upstream.ok) {
            const account = await upstream.json();
            const { syncAccountProfile } = await import('../../../../lib/accountProfileSync');
            await syncAccountProfile(db, {
              userId: session.userId,
              username: account.username,
              email: account.email,
              displayName: account.display_name || account.displayName || '',
            });
          }
        } catch (error) {
          console.warn('[auth/me] Account reconciliation skipped:', error?.message || error);
        }
      }

      return db.prepare(`
        SELECT id, email, username, display_name, designation, bio, avatar_url, avatar_r2_key, banner_r2_key, locale,
               tier, storage_used_bytes, ai_usage_today, ai_usage_date,
               location, timezone, pronouns, website, company, links,
               created_at, updated_at
        FROM users WHERE id = ?
      `).bind(session.userId).first();
    });

    if (user) return NextResponse.json(user);

    // DB was reachable and returned no row → the account was purged
    // (e.g. revoked on accounts.elixpo). Don't trust the stale cookie profile;
    // clear the session so the client treats the user as signed out.
    if (dbReached) {
      const { clearSession } = await import('../../../../lib/auth');
      await clearSession();
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  } catch {
    // D1/KV not available — fall through to the cached profile (local dev).
  }

  if (session.profile) return NextResponse.json(session.profile);

  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
