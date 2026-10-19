export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getLimits, formatBytes } from '../../../../lib/tiers';

export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const user = await db.prepare(
      'SELECT tier, storage_used_bytes, ai_usage_today, ai_usage_date FROM users WHERE id = ?'
    ).bind(session.userId).first();

    if (!user) {
      return fallbackResponse();
    }

    const limits = getLimits(user.tier);
    const today = new Date().toISOString().slice(0, 10);
    const aiUsedToday = user.ai_usage_date === today ? user.ai_usage_today : 0;

    const orgCount = await db.prepare(
      'SELECT COUNT(*) as count FROM orgs WHERE owner_id = ?'
    ).bind(session.userId).first();

    return NextResponse.json({
      tier: user.tier,
      storage: {
        used: user.storage_used_bytes,
        limit: limits.totalStorageBytes,
        usedFormatted: formatBytes(user.storage_used_bytes),
        limitFormatted: formatBytes(limits.totalStorageBytes),
        remaining: Math.max(0, limits.totalStorageBytes - user.storage_used_bytes),
        remainingFormatted: formatBytes(Math.max(0, limits.totalStorageBytes - user.storage_used_bytes)),
        percent: Math.round((user.storage_used_bytes / limits.totalStorageBytes) * 100),
      },
      ai: {
        used: aiUsedToday,
        limit: limits.aiRequestsPerDay,
        percent: Math.round((aiUsedToday / limits.aiRequestsPerDay) * 100),
      },
      orgs: {
        owned: orgCount?.count || 0,
        limit: limits.ownedOrgs,
      },
      limits: {
        imagePerBlogBytes: limits.imagePerBlogBytes,
        imagePerBlogFormatted: formatBytes(limits.imagePerBlogBytes),
        coAuthorsPerBlog: limits.coAuthorsPerBlog,
        canReadMemberOnly: limits.canReadMemberOnly,
        canMarkMemberOnly: limits.canMarkMemberOnly,
      },
    });
  } catch {
    // D1 not available (local dev) — return free tier defaults
    return fallbackResponse();
  }
}

function fallbackResponse() {
  const limits = getLimits('free');
  return NextResponse.json({
    tier: 'free',
    storage: {
      used: 0,
      limit: limits.totalStorageBytes,
      remaining: limits.totalStorageBytes,
      usedFormatted: '0 B',
      limitFormatted: formatBytes(limits.totalStorageBytes),
      remainingFormatted: formatBytes(limits.totalStorageBytes),
      percent: 0,
    },
    ai: { used: 0, limit: limits.aiRequestsPerDay, percent: 0 },
    orgs: { owned: 0, limit: limits.ownedOrgs },
    limits: {
      imagePerBlogBytes: limits.imagePerBlogBytes,
      imagePerBlogFormatted: formatBytes(limits.imagePerBlogBytes),
      coAuthorsPerBlog: limits.coAuthorsPerBlog,
      canReadMemberOnly: limits.canReadMemberOnly,
      canMarkMemberOnly: limits.canMarkMemberOnly,
    },
  });
}
