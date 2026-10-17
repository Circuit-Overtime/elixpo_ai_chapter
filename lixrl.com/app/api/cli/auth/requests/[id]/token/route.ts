import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/auth';
import { getDB, getOrigin } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { TIER_LIMITS, type Tier } from '@/lib/types';
import { generateApiKey, hashApiKey } from '@/lib/utils';

export const runtime = 'edge';

interface CliAuthRow {
  id: string;
  user_id: number;
  poll_secret_hash: string;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  key_name: string | null;
  scopes: string | null;
  key_expires_at: string | null;
  tier: Tier;
  email: string;
  display_name: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await rateLimit(request, 'cli:auth:poll', 60, 60);
  if (limited) return limited;
  const { id } = await params;
  let pollSecret = '';
  try {
    const body = await request.json() as { poll_secret?: unknown };
    pollSecret = typeof body.poll_secret === 'string' ? body.poll_secret : '';
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!pollSecret) return NextResponse.json({ error: 'poll_secret is required' }, { status: 400 });

  const pollHash = await hashApiKey(pollSecret);
  const db = getDB();
  const row = await db.prepare(
    `SELECT car.*, u.tier, u.email, u.display_name
     FROM cli_auth_requests car JOIN users u ON u.id = car.user_id
     WHERE car.id = ? AND car.poll_secret_hash = ? AND datetime(car.expires_at) > datetime('now')`,
  ).bind(id, pollHash).first<CliAuthRow>();
  if (!row) return NextResponse.json({ error: 'CLI authorization is invalid or expired' }, { status: 401 });
  if (row.status === 'pending') return NextResponse.json({ status: 'pending' }, { status: 202 });
  if (row.status === 'denied') return NextResponse.json({ error: 'CLI authorization was denied' }, { status: 403 });
  if (row.status === 'consumed') return NextResponse.json({ error: 'CLI authorization was already completed' }, { status: 410 });

  const limits = TIER_LIMITS[row.tier];
  const keyCount = await db.prepare(
    `SELECT COUNT(*) as count FROM api_keys
     WHERE user_id = ? AND is_active = 1
     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  ).bind(row.user_id).first<{ count: number }>();
  if ((keyCount?.count || 0) >= limits.maxApiKeys) {
    return NextResponse.json({
      error: `API key limit reached (${limits.maxApiKeys} for ${row.tier} tier)`,
      code: 'api_key_limit_reached',
      limit: limits.maxApiKeys,
      tier: row.tier,
      manage_url: `${getOrigin(request.url)}/profile/keys`,
      retry_command: 'lixrl login --open',
    }, { status: 403 });
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8);
  const results = await db.batch([
    db.prepare(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, scopes, expires_at)
       SELECT user_id, ?, ?, key_name, scopes, key_expires_at
       FROM cli_auth_requests WHERE id = ? AND status = 'approved'`,
    ).bind(keyHash, keyPrefix, id),
    db.prepare(
      `UPDATE cli_auth_requests SET status = 'consumed', consumed_at = datetime('now')
       WHERE id = ? AND status = 'approved'`,
    ).bind(id),
  ]);
  if (!results[0].meta.changes) {
    return NextResponse.json({ error: 'CLI authorization was already completed' }, { status: 410 });
  }

  auditLog(row.user_id, 'apikey.create.device', 'api_key', keyPrefix).catch(() => {});
  return NextResponse.json({
    status: 'approved',
    key: rawKey,
    prefix: keyPrefix,
    name: row.key_name,
    scopes: row.scopes,
    expires_at: row.key_expires_at,
    user: { email: row.email, display_name: row.display_name, tier: row.tier },
  });
}
