import { NextRequest, NextResponse } from 'next/server';
import { verifyCliAccountsAccessToken } from '@/lib/accounts-cli-auth';
import { fetchUserInfo, upsertUser } from '@/lib/auth';
import { getDB, getOrigin } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { TIER_LIMITS } from '@/lib/types';
import { generateSessionId, hashApiKey } from '@/lib/utils';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'cli:auth:start', 10, 60);
  if (limited) return limited;

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!accessToken || accessToken.startsWith('elu_')) {
    return NextResponse.json({ error: 'Accounts device authorization is required' }, { status: 401 });
  }

  let userInfo: Awaited<ReturnType<typeof fetchUserInfo>>;
  try {
    await verifyCliAccountsAccessToken(accessToken);
    userInfo = await fetchUserInfo(accessToken);
  } catch {
    return NextResponse.json({ error: 'Accounts authorization is invalid or expired' }, { status: 401 });
  }

  const user = await upsertUser(userInfo);
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];
  const keyCount = await db.prepare(
    `SELECT COUNT(*) as count FROM api_keys
     WHERE user_id = ? AND is_active = 1
     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  ).bind(user.id).first<{ count: number }>();
  if ((keyCount?.count || 0) >= limits.maxApiKeys) {
    return NextResponse.json({
      error: `API key limit reached (${limits.maxApiKeys} for ${user.tier} tier)`,
      code: 'api_key_limit_reached',
      limit: limits.maxApiKeys,
      tier: user.tier,
      manage_url: `${getOrigin(request.url)}/profile/keys`,
      retry_command: 'lixrl login --open',
    }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const pollSecret = generateSessionId();
  const pollSecretHash = await hashApiKey(pollSecret);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await db.prepare(
    `UPDATE cli_auth_requests SET status = 'denied'
     WHERE user_id = ? AND status = 'pending'`,
  ).bind(user.id).run();
  await db.prepare(
    `INSERT INTO cli_auth_requests (id, user_id, poll_secret_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(id, user.id, pollSecretHash, expiresAt).run();

  db.prepare('DELETE FROM cli_auth_requests WHERE datetime(expires_at) < datetime("now")')
    .run()
    .catch(() => {});

  return NextResponse.json({
    request_id: id,
    poll_secret: pollSecret,
    approval_url: `${getOrigin(request.url)}/cli/authorize?request=${encodeURIComponent(id)}`,
    expires_in: 600,
    interval: 3,
  }, { status: 201 });
}
