export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getDB } from '../../../../lib/cloudflare';
import {
  USER_CLOUDINARY,
  parseCloudinaryUrl,
  saveCloudinaryConnection,
} from '../../../../lib/cloudinaryConnections';
import { testCloudinaryConfig } from '../../../../lib/cloudinary';
import { decryptIntegrationSecret } from '../../../../lib/integrationSecrets';
import { revokeCloudinaryToken } from '../../../../lib/cloudinaryOAuth';

async function authenticatedContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  return { userId: session.userId, db: getDB() };
}

async function connectionStatus(db, userId) {
  const connection = await db.prepare(`
    SELECT cloud_name, enabled, created_at, updated_at, auth_method
    FROM cloudinary_connections WHERE user_id = ?
  `).bind(userId).first();
  const usage = await db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
    FROM media_uploads WHERE user_id = ? AND storage_provider = ?
  `).bind(userId, USER_CLOUDINARY).first();
  return {
    connected: !!connection,
    useForUploads: !!connection?.enabled,
    cloudName: connection?.cloud_name || null,
    authMethod: connection?.auth_method || null,
    mediaCount: Number(usage?.count || 0),
    trackedBytes: Number(usage?.bytes || 0),
    connectedAt: connection?.created_at || null,
    updatedAt: connection?.updated_at || null,
  };
}

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(await connectionStatus(context.db, context.userId));
}

export async function POST(request) {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.cloudinaryUrl !== 'string' || body.cloudinaryUrl.length > 2048) {
    return NextResponse.json({ error: 'A Cloudinary API environment URL is required' }, { status: 400 });
  }

  let config;
  try {
    config = parseCloudinaryUrl(body.cloudinaryUrl);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const existing = await context.db.prepare(
    'SELECT cloud_name FROM cloudinary_connections WHERE user_id = ?',
  ).bind(context.userId).first();
  if (existing && existing.cloud_name !== config.cloudName) {
    const used = await context.db.prepare(`
      SELECT COUNT(*) AS count FROM media_uploads
      WHERE user_id = ? AND storage_provider = ?
    `).bind(context.userId, USER_CLOUDINARY).first();
    if (Number(used?.count || 0) > 0) {
      return NextResponse.json({
        error: 'Delete media stored in the current personal Cloudinary space before replacing the connection.',
      }, { status: 409 });
    }
  }

  try {
    await testCloudinaryConfig(config);
    await saveCloudinaryConnection(context.db, context.userId, config);
  } catch (error) {
    console.error('[cloudinary/integration] Connection failed:', error?.message || error);
    const missingEncryptionKey = String(error?.message || '').includes('CLOUDINARY_CONNECTION_ENCRYPTION_KEY');
    return NextResponse.json({
      error: missingEncryptionKey
        ? 'Personal Cloudinary connections are not configured on this deployment.'
        : 'Cloudinary rejected the supplied environment URL.',
    }, { status: missingEncryptionKey ? 503 : 400 });
  }

  return NextResponse.json(await connectionStatus(context.db, context.userId));
}

export async function PATCH(request) {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.useForUploads !== 'boolean') {
    return NextResponse.json({ error: 'useForUploads must be a boolean' }, { status: 400 });
  }
  const result = await context.db.prepare(`
    UPDATE cloudinary_connections SET enabled = ?, updated_at = ? WHERE user_id = ?
  `).bind(body.useForUploads ? 1 : 0, Math.floor(Date.now() / 1000), context.userId).run();
  if (!result.meta?.changes) return NextResponse.json({ error: 'No Cloudinary connection found' }, { status: 404 });
  return NextResponse.json(await connectionStatus(context.db, context.userId));
}

export async function DELETE() {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const used = await context.db.prepare(`
    SELECT COUNT(*) AS count FROM media_uploads
    WHERE user_id = ? AND storage_provider = ?
  `).bind(context.userId, USER_CLOUDINARY).first();
  if (Number(used?.count || 0) > 0) {
    return NextResponse.json({
      error: 'This connection still owns blog media. Delete those assets from the Media tab before removing it.',
    }, { status: 409 });
  }
  const connection = await context.db.prepare(`
    SELECT auth_method, refresh_token_encrypted
    FROM cloudinary_connections WHERE user_id = ?
  `).bind(context.userId).first();
  if (connection?.auth_method === 'oauth' && connection.refresh_token_encrypted) {
    try {
      const refreshToken = await decryptIntegrationSecret(connection.refresh_token_encrypted);
      await revokeCloudinaryToken(refreshToken);
    } catch (error) {
      console.warn('[cloudinary/integration] Token revocation failed:', error?.message || error);
    }
  }
  await context.db.prepare('DELETE FROM cloudinary_connections WHERE user_id = ?').bind(context.userId).run();
  return NextResponse.json(await connectionStatus(context.db, context.userId));
}
