export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import { testCloudinaryConfig } from '../../../../../lib/cloudinary';
import { USER_CLOUDINARY, saveCloudinaryOAuthConnection } from '../../../../../lib/cloudinaryConnections';
import {
  exchangeCloudinaryCode,
  isValidCloudinaryCloudName,
  resolveCloudinaryCloudName,
  revokeCloudinaryToken,
} from '../../../../../lib/cloudinaryOAuth';

function finish(request, result, reference = '') {
  const savedNext = request.cookies.get('cloudinary_oauth_next')?.value || '';
  const safeNext = savedNext.startsWith('/') && !savedNext.startsWith('//')
    ? savedNext
    : '/settings?tab=integrations';
  const destination = new URL(safeNext, request.url);
  destination.searchParams.set('cloudinary', result);
  if (reference) destination.searchParams.set('cloudinary_ref', reference);
  const response = NextResponse.redirect(destination);
  response.cookies.delete('cloudinary_oauth_state');
  response.cookies.delete('cloudinary_oauth_next');
  response.cookies.delete('cloudinary_oauth_cloud_name');
  return response;
}

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.redirect(new URL('/sign-in', request.url));

  const callbackUrl = new URL(request.url);
  const authorizationError = callbackUrl.searchParams.get('error');
  if (authorizationError) {
    if (authorizationError === 'access_denied') return finish(request, 'denied');
    const reference = crypto.randomUUID().slice(0, 8);
    console.warn(`[cloudinary/oauth] Authorization failed code=${authorizationError} ref=${reference}`);
    return finish(request, 'authorization_failed', reference);
  }

  const code = callbackUrl.searchParams.get('code');
  const state = callbackUrl.searchParams.get('state');
  const savedState = request.cookies.get('cloudinary_oauth_state')?.value;
  if (!code || !state || !savedState || state !== savedState) return finish(request, 'invalid_state');

  let tokens;
  let stage = 'token_exchange';
  const reference = crypto.randomUUID().slice(0, 8);
  try {
    tokens = await exchangeCloudinaryCode({ code, origin: callbackUrl.origin });
    stage = 'offline_access';
    if (!tokens.refresh_token) throw new Error('Offline Access did not issue a refresh token');

    stage = 'environment';
    const tokenCloudName = await resolveCloudinaryCloudName(tokens, callbackUrl);
    const requestedCloudName = request.cookies.get('cloudinary_oauth_cloud_name')?.value || '';
    // Cloudinary self-service OAuth is currently beta. Some otherwise valid
    // grants omit ext.cloud_name. A user-supplied cloud name is safe to use
    // only because the following API request verifies the token against it.
    const cloudName = tokenCloudName || requestedCloudName;
    if (!isValidCloudinaryCloudName(cloudName)) {
      throw new Error('Cloudinary did not identify the selected product environment');
    }

    stage = 'validation';
    await testCloudinaryConfig({ cloudName, oauthToken: tokens.access_token });
    stage = 'database';
    const db = getDB();
    const existing = await db.prepare(
      'SELECT cloud_name FROM cloudinary_connections WHERE user_id = ?',
    ).bind(session.userId).first();
    if (existing && existing.cloud_name !== cloudName) {
      const usage = await db.prepare(`
        SELECT COUNT(*) AS count FROM media_uploads
        WHERE user_id = ? AND storage_provider = ?
      `).bind(session.userId, USER_CLOUDINARY).first();
      if (Number(usage?.count || 0) > 0) {
        await revokeCloudinaryToken(tokens.refresh_token).catch(() => {});
        return finish(request, 'storage_in_use');
      }
    }

    stage = 'persistence';
    await saveCloudinaryOAuthConnection(db, session.userId, {
      cloudName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    });
    return finish(request, 'connected');
  } catch (error) {
    console.error(`[cloudinary/oauth] Callback failed stage=${stage} ref=${reference}:`, error?.message || error);
    if (tokens?.refresh_token) await revokeCloudinaryToken(tokens.refresh_token).catch(() => {});
    return finish(request, `failed_${stage}`, reference);
  }
}
