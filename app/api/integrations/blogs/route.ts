import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/auth';
import { createUrlForUser } from '@/lib/create-url';
import { getDB, getEnv } from '@/lib/db';
import { rateLimitSubject } from '@/lib/ratelimit';
import { TIER_LIMITS, type User } from '@/lib/types';

export const runtime = 'edge';

const SERVICE = 'blogs';

interface DelegatedIdentity {
  id?: unknown;
  email?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
}

async function serviceAuthorized(request: NextRequest): Promise<boolean> {
  const configured = getEnv().BLOGS_INTEGRATION_TOKEN;
  const provided = request.headers.get('authorization');
  if (!configured || !provided) return false;
  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${configured}`)),
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
  ]);
  const left = new Uint8Array(expected);
  const right = new Uint8Array(actual);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ (right[index] || 0);
  return mismatch === 0;
}

function parseIdentity(value: unknown): { id: string; email: string; displayName: string; avatar: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const identity = value as DelegatedIdentity;
  const id = typeof identity.id === 'string' ? identity.id.trim() : '';
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  const displayName = typeof identity.display_name === 'string' ? identity.display_name.trim() : '';
  const avatar = typeof identity.avatar_url === 'string' && identity.avatar_url.trim() ? identity.avatar_url.trim() : null;
  if (!id || !email || !displayName || id.length > 128 || email.length > 320 || displayName.length > 100) return null;
  return { id, email, displayName, avatar };
}

async function findUser(elixpoId: string): Promise<User | null> {
  const user = await getDB().prepare('SELECT * FROM users WHERE elixpo_id = ? AND is_active = 1')
    .bind(elixpoId).first<User>();
  if (user?.tier !== 'free' && user?.tier_expires_at && Date.parse(user.tier_expires_at) < Date.now()) {
    return { ...user, tier: 'free' };
  }
  return user;
}

async function upsertDelegatedUser(identity: ReturnType<typeof parseIdentity>): Promise<User | null> {
  if (!identity) return null;
  const db = getDB();
  const existing = await findUser(identity.id);
  if (existing) {
    const emailOwner = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(identity.email, existing.id).first();
    if (emailOwner) return null;
    await db.prepare(
      `UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(identity.email, identity.displayName, identity.avatar, existing.id).run();
    return { ...existing, email: identity.email, display_name: identity.displayName, avatar_url: identity.avatar };
  }

  const emailOwner = await db.prepare('SELECT id FROM users WHERE email = ?').bind(identity.email).first();
  if (emailOwner) return null;
  return db.prepare(
    `INSERT INTO users (elixpo_id, email, display_name, avatar_url)
     VALUES (?, ?, ?, ?) RETURNING *`,
  ).bind(identity.id, identity.email, identity.displayName, identity.avatar).first<User>();
}

async function isConnected(userId: number): Promise<boolean> {
  const row = await getDB().prepare(
    'SELECT user_id FROM service_bindings WHERE user_id = ? AND service = ? AND revoked_at IS NULL',
  ).bind(userId, SERVICE).first();
  return Boolean(row);
}

async function accountStatus(user: User) {
  const count = await getDB().prepare('SELECT COUNT(*) AS count FROM urls WHERE user_id = ?')
    .bind(user.id).first<{ count: number }>();
  return {
    connected: true,
    account: {
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      tier: user.tier,
      limits: TIER_LIMITS[user.tier],
      usage: { urls: count?.count || 0 },
    },
  };
}

export async function POST(request: NextRequest) {
  if (!(await serviceAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized integration' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action;
  const identity = parseIdentity(body?.user);
  if (!identity) return NextResponse.json({ error: 'Valid user identity is required' }, { status: 400 });

  if (action === 'status') {
    const user = await findUser(identity.id);
    if (!user || !(await isConnected(user.id))) return NextResponse.json({ connected: false });
    return NextResponse.json(await accountStatus(user));
  }

  if (action === 'connect') {
    const user = await upsertDelegatedUser(identity);
    if (!user) return NextResponse.json({ error: 'This email is already attached to another LixRL account' }, { status: 409 });
    await getDB().prepare(
      `INSERT INTO service_bindings (user_id, service) VALUES (?, ?)
       ON CONFLICT(user_id, service) DO UPDATE SET revoked_at = NULL, connected_at = datetime('now')`,
    ).bind(user.id, SERVICE).run();
    auditLog(user.id, 'integration.connect', 'service', SERVICE).catch(() => {});
    return NextResponse.json(await accountStatus(user));
  }

  const user = await findUser(identity.id);
  if (!user || !(await isConnected(user.id))) {
    return NextResponse.json({ error: 'Connect LixRL in Blogs settings first', connected: false }, { status: 409 });
  }

  if (action === 'disconnect') {
    await getDB().prepare(
      `UPDATE service_bindings SET revoked_at = datetime('now') WHERE user_id = ? AND service = ?`,
    ).bind(user.id, SERVICE).run();
    auditLog(user.id, 'integration.disconnect', 'service', SERVICE).catch(() => {});
    return NextResponse.json({ connected: false });
  }

  if (action === 'shorten') {
    const limit = TIER_LIMITS[user.tier].rateLimitPerMin;
    const limited = await rateLimitSubject('integration:blogs:shorten', String(user.id), limit, 60);
    if (limited) return limited;
    const response = await createUrlForUser(user, { url: body.url, title: body.title });
    if (response.ok) {
      getDB().prepare(
        `UPDATE service_bindings SET last_used_at = datetime('now') WHERE user_id = ? AND service = ?`,
      ).bind(user.id, SERVICE).run().catch(() => {});
    }
    return response;
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
