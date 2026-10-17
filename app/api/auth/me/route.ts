import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDB();
  const limits = TIER_LIMITS[user.tier];
  const urlCount = await db
    .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
    .bind(user.id)
    .first<{ count: number }>();

  return NextResponse.json({
    id: user.id,
    elixpo_id: user.elixpo_id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    role: user.role,
    tier: user.tier,
    limits,
    usage: { urls: urlCount?.count || 0 },
  });
}
