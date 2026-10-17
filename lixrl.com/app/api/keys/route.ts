import { NextRequest, NextResponse } from 'next/server';
import { resolveUser, auditLog } from '@/lib/auth';
import { getDB, getOrigin } from '@/lib/db';
import { generateApiKey, hashApiKey } from '@/lib/utils';
import { TIER_LIMITS } from '@/lib/types';
import { validateLength, isValidScopes, badRequest } from '@/lib/validate';
import { requireSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  // 10 key creations per minute per IP
  const limited = await rateLimit(request, 'key:create', 10, 60);
  if (limited) return limited;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, scopes, expires_at }: any = await request.json();
  const limits = TIER_LIMITS[user.tier];
  const db = getDB();

  if (!name || typeof name !== 'string') return badRequest('name is required');
  const nameErr = validateLength(name.trim(), 'Name', 1, 64);
  if (nameErr) return badRequest(nameErr);

  const resolvedScopes = scopes || 'read,write';
  if (!isValidScopes(resolvedScopes)) return badRequest('scopes must be "read" or "read,write"');

  const keyCount = await db.prepare(
    `SELECT COUNT(*) as count FROM api_keys
     WHERE user_id = ? AND is_active = 1
     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  )
    .bind(user.id).first<{ count: number }>();

  if ((keyCount?.count || 0) >= limits.maxApiKeys) {
    return NextResponse.json({
      error: `API key limit reached (${limits.maxApiKeys} for ${user.tier} tier)`,
      code: 'api_key_limit_reached',
      limit: limits.maxApiKeys,
      tier: user.tier,
      manage_url: `${getOrigin(request.url)}/profile/keys`,
      retry_command: 'lixrl keys create --name <name>',
    }, { status: 403 });
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8);

  await db.prepare('INSERT INTO api_keys (user_id, key_hash, key_prefix, name, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(user.id, keyHash, keyPrefix, name.trim(), resolvedScopes, expires_at || null).run();

  auditLog(user.id, 'apikey.create', 'api_key', keyPrefix).catch(() => {});

  return NextResponse.json({ key: rawKey, prefix: keyPrefix, name: name.trim(), scopes: resolvedScopes }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDB();
  const { results } = await db.prepare(
    'SELECT id, key_prefix, name, scopes, last_used_at, expires_at, is_active, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();

  return NextResponse.json({ keys: results });
}
