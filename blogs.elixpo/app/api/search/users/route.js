export const runtime = 'edge';
import { NextResponse } from 'next/server';

// Granular user search with selectable fields
// ?q=query&fields=id,username,display_name,avatar_url,bio,followers,blogs
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const fields = (searchParams.get('fields') || 'id,username,display_name,avatar_url').split(',').map(f => f.trim());
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);

  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const pattern = `%${q}%`;

    // Base columns always fetched (cheap)
    const baseUsers = await db.prepare(`
      SELECT id, username, display_name, avatar_url, bio, created_at
      FROM users WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?
      LIMIT ?
    `).bind(pattern, pattern, limit).all();

    const users = baseUsers?.results || [];

    // Enrich with optional fields if requested (only queries what's needed)
    if (users.length > 0 && (fields.includes('followers') || fields.includes('blogs') || fields.includes('likes'))) {
      for (const u of users) {
        if (fields.includes('followers')) {
          const fc = await db.prepare("SELECT COUNT(*) as c FROM follows WHERE following_id = ? AND following_type = 'user'").bind(u.id).first();
          u.followers = fc?.c || 0;
        }
        if (fields.includes('blogs')) {
          const bc = await db.prepare("SELECT COUNT(*) as c FROM blogs WHERE author_id = ? AND status = 'published' AND secret = 0").bind(u.id).first();
          u.blog_count = bc?.c || 0;
        }
        if (fields.includes('likes')) {
          const lc = await db.prepare("SELECT COUNT(*) as c FROM likes l JOIN blogs b ON b.id = l.blog_id WHERE b.author_id = ? AND b.secret = 0").bind(u.id).first();
          u.total_likes = lc?.c || 0;
        }
      }
    }

    // Strip fields not requested
    const allowed = new Set(fields);
    allowed.add('id'); // always include id
    const filtered = users.map(u => {
      const out = {};
      for (const k of Object.keys(u)) {
        if (allowed.has(k)) out[k] = u[k];
      }
      return out;
    });

    return NextResponse.json({ users: filtered });
  } catch {
    return NextResponse.json({ users: [] });
  }
}
