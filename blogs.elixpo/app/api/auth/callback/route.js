export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getOAuthConfig, signSession } from '../../../../lib/auth';
import { normalizeAccountUsername } from '../../../../lib/accountProfileSync';
import { safeRelativeRedirect } from '../../../../lib/safeRedirect';

const SESSION_MAX_AGE = 60 * 60 * 24 * 15; // 15 days

function redirectAuthError(request, code) {
  const target = new URL('/auth-error', request.url);
  target.searchParams.set('code', code);
  return NextResponse.redirect(target);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return redirectAuthError(request, error);
  }

  if (!code) {
    return redirectAuthError(request, 'missing_code');
  }

  // Validate CSRF state
  const cookieStore = request.cookies;
  const savedState = cookieStore.get('oauth_state')?.value;
  if (!savedState || savedState !== state) {
    return redirectAuthError(request, 'invalid_state');
  }

  const config = getOAuthConfig();
  const redirectBase = new URL(request.url).origin;
  const redirectUri = `${redirectBase}/api/auth/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error('Token exchange failed:', tokenRes.status, errorBody);
    return redirectAuthError(request, 'token_exchange_failed');
  }

  const tokenData = await tokenRes.json();

  // Fetch user profile from Elixpo Accounts
  const userInfoRes = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    return redirectAuthError(request, 'user_info_failed');
  }

  const rawUserInfo = await userInfoRes.json();
  // Accounts.elixpo.com returns snake_case (avatar_url, display_name, username);
  // older shape used camelCase (avatar, displayName). Normalize so the rest of the
  // file can use a single shape.
  const userInfo = {
    ...rawUserInfo,
    email: rawUserInfo.email,
    displayName: rawUserInfo.display_name || rawUserInfo.displayName || '',
    avatar: rawUserInfo.avatar_url || rawUserInfo.avatar || '',
    username: rawUserInfo.username || '',
    isAdmin: rawUserInfo.isAdmin || false,
  };
  const userId = rawUserInfo.id || rawUserInfo.userId || rawUserInfo.sub;
  let isNewUser = false;

  // Try to upsert user into D1 (only works in Cloudflare edge runtime)
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const existingUser = await db.prepare('SELECT id, account_status FROM users WHERE id = ?').bind(userId).first();
    const { syncAccountProfile } = await import('../../../../lib/accountProfileSync');
    const accountUsername = normalizeAccountUsername(userInfo.username);

    // Block permanently deleted accounts
    if (existingUser?.account_status === 'removed') {
      return redirectAuthError(request, 'account_deleted');
    }
    const now = Math.floor(Date.now() / 1000);

    if (!existingUser) {
      isNewUser = true;
      const username = accountUsername
        || (userInfo.displayName || userInfo.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

      // Mirror OAuth avatar to Cloudinary at deterministic path. Use the
      // returned version so the URL changes on each re-upload (cache-bust).
      let avatarUrl = userInfo.avatar || '';
      try {
        if (avatarUrl) {
          const { uploadRemoteAvatar, userAvatarPublicId, userAvatarCdnUrl } = await import('../../../../lib/cloudinary');
          const result = await uploadRemoteAvatar(avatarUrl, userAvatarPublicId(username));
          avatarUrl = userAvatarCdnUrl(username, result?.version);
        }
      } catch (e) { console.warn('Avatar mirror failed:', e.message); }

      await db.prepare(`
        INSERT INTO users (id, email, username, display_name, avatar_url, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        userInfo.email,
        username,
        userInfo.displayName || '',
        avatarUrl,
        'en',
        now,
        now
      ).run();

      // Reserve username in shared namespace (atomic — ignores if already taken)
      try {
        const { tryReserveName } = await import('../../../../lib/namespace');
        await tryReserveName(db, username, 'user', userId);
      } catch { /* namespace table may not exist in local dev */ }
    } else {
      // Get username for deterministic avatar path
      const existingData = await db.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first();
      const username = accountUsername || existingData?.username || userId;

      // Re-sync the avatar from accounts.elixpo on every login. Versioned URL
      // busts caches so a changed accounts photo shows immediately.
      let avatarUrl = userInfo.avatar || '';
      let avatarSynced = false;
      try {
        if (avatarUrl) {
          const { uploadRemoteAvatar, userAvatarPublicId, userAvatarCdnUrl } = await import('../../../../lib/cloudinary');
          const result = await uploadRemoteAvatar(avatarUrl, userAvatarPublicId(username));
          avatarUrl = userAvatarCdnUrl(username, result?.version);
          avatarSynced = true;
        }
      } catch (e) { console.warn('Avatar mirror failed:', e.message); }

      // Accounts is the identity source of truth, including username. Updating
      // users.username changes every personal blog's canonical /user/slug URL;
      // the sync helper also updates the namespace and records the old alias.
      await syncAccountProfile(db, {
        userId,
        username,
        email: userInfo.email,
        displayName: userInfo.displayName || '',
        ...(avatarSynced ? { avatarUrl } : {}),
      });
      await db.prepare("UPDATE users SET account_status = 'active' WHERE id = ?").bind(userId).run();
    }
    // Bust the cached profile so the freshly-synced avatar/name shows at once.
    try {
      const { kvInvalidate } = await import('../../../../lib/cache');
      await kvInvalidate(`v1:user:${userId}`);
    } catch {}
  } catch (e) {
    // D1 not available (local dev) — user data lives in session cookie only
    console.warn('D1 not available, skipping user upsert:', e.message);
  }

  // Send login alert email (fire and forget)
  if (!isNewUser && userInfo.email) {
    try {
      const { sendLoginAlert } = await import('../../../../lib/email');
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
      const city = request.headers.get('cf-ipcity') || '';
      const country = request.headers.get('cf-ipcountry') || '';
      const location = [city, country].filter(Boolean).join(', ') || 'Unknown location';
      const ua = request.headers.get('user-agent') || '';
      const time = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
      sendLoginAlert(userInfo.email, { displayName: userInfo.displayName, ip, location, userAgent: ua, time }).catch(() => {});
    } catch {}
  }

  // Build session with user profile from OAuth provider, then HMAC-sign it
  // so the cookie cannot be forged/tampered (see lib/auth.js).
  // If SESSION_SECRET is missing in this environment, fail gracefully to the
  // sign-in page instead of a hard 500.
  let session;
  try {
    session = await signSession({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      userId,
      // Cache user profile in cookie so /api/auth/me works without D1
      profile: {
        id: userId,
        email: userInfo.email,
        username: normalizeAccountUsername(userInfo.username)
          || (userInfo.displayName || userInfo.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32),
        display_name: userInfo.displayName || '',
        avatar_url: userInfo.avatar || '',
        isAdmin: userInfo.isAdmin || false,
      },
    });
  } catch (e) {
    console.error('Session signing failed — is SESSION_SECRET set in this environment?', e?.message || e);
    return redirectAuthError(request, 'server');
  }

  // Honor a post-login redirect set by /api/auth/login (same-site relative paths only).
  const redirectTo = safeRelativeRedirect(request.cookies.get('oauth_next')?.value) || '/';
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set('lixblogs_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  response.cookies.delete('oauth_state');
  response.cookies.delete('oauth_next');
  return response;
}
