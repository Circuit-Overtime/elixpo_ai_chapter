export const runtime = 'edge';
import { NextResponse } from 'next/server';

/**
 * GET /api/cron/weekly-digest
 * Sends weekly digest emails to all active users with the top 5 posts of the week.
 * Triggered by Cloudflare Cron Trigger (every Sunday at 9am UTC).
 * Protected by a shared secret in the Authorization header.
 */
export async function GET(request) {
  // Check if digest is enabled
  if (process.env.ENABLE_WEEKLY_DIGEST !== 'true') {
    return NextResponse.json({ ok: false, reason: 'Weekly digest is disabled (ENABLE_WEEKLY_DIGEST != true)' });
  }

  // Verify cron secret (prevents public access). Fail closed: if the secret is
  // not configured, reject — never run unauthenticated.
  const authHeader = request.headers.get('Authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { sendWeeklyDigest } = await import('../../../../lib/email');
    const db = getDB();

    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;

    // Get top 5 posts from the past week
    const topPosts = await db.prepare(`
      SELECT b.slug, b.title, b.subtitle, b.page_emoji, b.read_time_minutes,
             b.author_id, u.username AS author_username, u.display_name AS author_name, u.avatar_url AS author_avatar
      FROM blogs b
      JOIN users u ON u.id = b.author_id
      WHERE b.status = 'published' AND b.secret = 0 AND b.published_at > ?
      ORDER BY b.like_count DESC, b.view_count DESC, b.published_at DESC
      LIMIT 5
    `).bind(weekAgo).all();

    const picks = (topPosts?.results || []).map(p => ({
      title: p.title,
      slug: p.slug,
      subtitle: p.subtitle,
      emoji: p.page_emoji,
      readTime: p.read_time_minutes,
      authorName: p.author_name || p.author_username,
      authorUsername: p.author_username,
      authorAvatar: p.author_avatar,
    }));

    // Week label
    const startDate = new Date(weekAgo * 1000);
    const endDate = new Date(now * 1000);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekLabel = `${fmt(startDate)} – ${fmt(endDate)}, ${endDate.getFullYear()}`;

    // Get all active users with emails (batch in pages of 100)
    let sent = 0;
    let offset = 0;
    const batchSize = 100;

    while (true) {
      const users = await db.prepare(
        "SELECT email, display_name FROM users WHERE account_status = 'active' AND email IS NOT NULL LIMIT ? OFFSET ?"
      ).bind(batchSize, offset).all();

      const rows = users?.results || [];
      if (rows.length === 0) break;

      // Send emails concurrently in batches
      await Promise.allSettled(
        rows.map(user =>
          sendWeeklyDigest(user.email, {
            displayName: user.display_name,
            picks,
            weekLabel,
          }).catch(() => {})
        )
      );

      sent += rows.length;
      offset += batchSize;
      if (rows.length < batchSize) break;
    }

    return NextResponse.json({ ok: true, sent, picks: picks.length });
  } catch (e) {
    console.error('Weekly digest error:', e);
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}
