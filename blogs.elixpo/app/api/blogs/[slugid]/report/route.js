export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { MODERATION_AUTOHIDE_THRESHOLD } from '../../../../../lib/limits';

const REASONS = new Set(['spam', 'harassment', 'nsfw', 'copyright', 'misinfo', 'other']);
const MAX_DETAIL = 1000;

export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}
  const reason = String(body.reason || '').toLowerCase();
  const detail = String(body.detail || '').slice(0, MAX_DETAIL);
  if (!REASONS.has(reason)) return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');  
    const db = getDB();

    const blog = await db.prepare(
      `SELECT b.id, b.title, b.slug, b.status, b.secret, b.author_id, u.username AS author_username
       FROM blogs b JOIN users u ON u.id = b.author_id WHERE b.id = ?`
    ).bind(slugid).first();
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    const { canEditBlog } = await import('../../../../../lib/permissions');
    if ((await canEditBlog(db, blog.id, session.userId)).ok) {
      return NextResponse.json({ error: "You can't report a post you manage" }, { status: 400 });
    }

    // Dedup: one report per (blog, reporter).
    const reportId = crypto.randomUUID();
    const ins = await db.prepare(
      'INSERT OR IGNORE INTO reports (id, blog_id, reporter_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(reportId, slugid, session.userId, reason, detail || null).run();
    if (!ins.meta?.changes) {
      return NextResponse.json({ ok: true, already: true });
    }

    // Existing moderation issue for this blog (if any prior report created one).
    const prior = await db.prepare(
      'SELECT gh_issue_number FROM reports WHERE blog_id = ? AND gh_issue_number IS NOT NULL LIMIT 1'
    ).bind(slugid).first();

    const origin = new URL(request.url).origin;
    const reporter = session.profile?.username || session.userId;
    // Canonical path is secret-aware: a secret post resolves to /{id}, never to
    // /{author_username}/{slug} — that form both 404s and names the author.
    const { getBlogCanonicalPath } = await import('../../../../../lib/blogUrl');
    const blogUrl = `${origin}${await getBlogCanonicalPath(db, slugid)}`;

    // Best-effort GitHub sync — never fail the report if GitHub is down.
    try {
      const { createIssue, commentIssue } = await import('../../../../../lib/github');
      if (prior?.gh_issue_number) {
        await commentIssue(prior.gh_issue_number,
          `New report on this blog\n- **By:** @${reporter}\n- **Reason:** ${reason}\n- **Detail:** ${detail || '—'}`);
        await db.prepare('UPDATE reports SET gh_issue_number = ? WHERE id = ?').bind(prior.gh_issue_number, reportId).run();
      } else {
        const issue = await createIssue({
          title: `[Report] ${blog.title || blog.slug}`,
          body: [
            `**Reported blog:** [${blog.title || blog.slug}](${blogUrl})`,
            `**Blog ID:** \`${blog.id}\``,
            blog.secret
              ? '**Author:** _withheld — secret (anonymous) post. Look up `author_id` by the Blog ID above in D1 if a takedown requires it._'
              : `**Author:** @${blog.author_username}`,
            `**Reported by:** @${reporter}`,
            `**Reason:** ${reason}`,
            `**Detail:** ${detail || '—'}`,
            '',
            '---',
            'Maintainers: add the **`takedown`** label to permanently remove this blog (author emailed), or **`dismiss`** to clear.',
          ].join('\n'),
          labels: blog.secret ? ['MODERATION', 'REPORT', 'SECRET'] : ['MODERATION', 'REPORT'],
        });
        await db.prepare('UPDATE reports SET gh_issue_number = ? WHERE id = ?').bind(issue.number, reportId).run();
      }
    } catch (e) {
      console.error('Moderation GitHub sync failed:', e?.message || e);
    }

    // Threshold auto-hide (reversible): distinct reporters ≥ threshold → under_review.
    const countRow = await db.prepare(
      'SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE blog_id = ?'
    ).bind(slugid).first();
    if ((countRow?.n || 0) >= MODERATION_AUTOHIDE_THRESHOLD && blog.status === 'published') {
      const { getBlogCanonicalPath } = await import('../../../../../lib/blogUrl');
      const publicUrl = `https://blogs.elixpo.com${await getBlogCanonicalPath(db, slugid)}`;
      await db.prepare("UPDATE blogs SET status = 'under_review', updated_at = unixepoch() WHERE id = ?").bind(slugid).run();
      try {
        const { invalidateBlogLifecycleCaches } = await import('../../../../../lib/api/v1/blogCache');
        await invalidateBlogLifecycleCaches(slugid);
      } catch {}
      const { notifySearchDiscovery } = await import('../../../../../lib/searchDiscovery');
      notifySearchDiscovery(publicUrl);
      try {
        const issueNo = prior?.gh_issue_number;
        if (issueNo) {
          const { commentIssue } = await import('../../../../../lib/github');
          await commentIssue(issueNo, `⚠️ Auto-hidden: reached ${MODERATION_AUTOHIDE_THRESHOLD} distinct reporters. Status set to \`under_review\` pending review.`);
        }
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Report error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
