export const runtime = 'edge';
import { NextResponse } from 'next/server';

// GET /api/users/<username>/follow-list?type=followers|following
// Returns the people/orgs in the follower or following list (max 100).
export async function GET(request, { params }) {
  const { username } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'following' ? 'following' : 'followers';

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const user = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (!user) return NextResponse.json({ items: [] }, { status: 404 });

    if (type === 'followers') {
      // Users who follow this user.
      const res = await db.prepare(`
        SELECT u.username, u.display_name, u.avatar_url
        FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ? AND f.following_type = 'user'
        ORDER BY f.created_at DESC LIMIT 100
      `).bind(user.id).all();
      const items = (res?.results || []).map((u) => ({
        type: 'user', name: u.display_name || u.username, handle: u.username, avatar: u.avatar_url,
      }));
      return NextResponse.json({ items });
    }

    // Following — can be users or orgs.
    const [users, orgs] = await Promise.all([
      db.prepare(`
        SELECT u.username, u.display_name, u.avatar_url, f.created_at
        FROM follows f JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = ? AND f.following_type = 'user'
        ORDER BY f.created_at DESC LIMIT 100
      `).bind(user.id).all(),
      db.prepare(`
        SELECT o.slug, o.name, o.logo_url, o.logo_r2_key, f.created_at
        FROM follows f JOIN orgs o ON o.id = f.following_id
        WHERE f.follower_id = ? AND f.following_type = 'org'
        ORDER BY f.created_at DESC LIMIT 100
      `).bind(user.id).all(),
    ]);
    const items = [
      ...(users?.results || []).map((u) => ({ type: 'user', name: u.display_name || u.username, handle: u.username, avatar: u.avatar_url, _t: u.created_at })),
      ...(orgs?.results || []).map((o) => ({ type: 'org', name: o.name || o.slug, handle: o.slug, avatar: o.logo_url || o.logo_r2_key, _t: o.created_at })),
    ].sort((a, b) => (b._t || 0) - (a._t || 0)).map(({ _t, ...rest }) => rest);
    return NextResponse.json({ items });
  } catch (e) {
    console.error('follow-list error:', e);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
