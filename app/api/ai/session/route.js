export const runtime = 'edge';
// Session management for lixsearch AI — generate/retrieve per-blog session IDs.
// LixSearch auto-creates sessions on first use, so we just generate + store IDs.

import { getSession } from '../../../../lib/auth';

/**
 * GET /api/ai/session?slugid=xxx
 * Returns the existing ai_session_id for a blog, or null.
 */
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slugid = searchParams.get('slugid');
  if (!slugid) {
    return new Response(JSON.stringify({ error: 'Missing slugid' }), { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const blog = await db.prepare('SELECT ai_session_id FROM blogs WHERE slugid = ? AND author_id = ?')
      .bind(slugid, session.userId).first();

    return new Response(JSON.stringify({ sessionId: blog?.ai_session_id || null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ sessionId: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * POST /api/ai/session
 * Generates a session ID and stores it on the blog record.
 * LixSearch will auto-create the session on first chat request.
 * Body: { slugid }
 */
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const body = await request.json();
  const { slugid } = body;
  if (!slugid) {
    return new Response(JSON.stringify({ error: 'Missing slugid' }), { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Check if blog already has a session
    const blog = await db.prepare('SELECT ai_session_id FROM blogs WHERE slugid = ? AND author_id = ?')
      .bind(slugid, session.userId).first();

    if (blog?.ai_session_id) {
      return new Response(JSON.stringify({ sessionId: blog.ai_session_id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate a new session ID
    const sessionId = `lixblogs-${slugid}-${crypto.randomUUID().slice(0, 8)}`;

    // Store on blog record
    await db.prepare('UPDATE blogs SET ai_session_id = ? WHERE slugid = ? AND author_id = ?')
      .bind(sessionId, slugid, session.userId).run();

    return new Response(JSON.stringify({ sessionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // D1 unavailable — generate ephemeral session ID (works for current session only)
    const sessionId = `lixblogs-eph-${crypto.randomUUID().slice(0, 12)}`;
    return new Response(JSON.stringify({ sessionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
