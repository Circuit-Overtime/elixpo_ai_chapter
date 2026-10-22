export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  const session = await getSession().catch(() => null);

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { getSearchSuggestions, recordSearch } = await import('../../../../lib/taste');
    const db = getDB();

    const suggestions = await getSearchSuggestions(db, session?.userId, q, 8);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}

// DELETE — clear the caller's search history.
//   /api/search/suggestions            → clear everything
//   /api/search/suggestions?q=<query>  → forget one entry
//
// Search history is personal data we collect silently to power suggestions, so the
// person it belongs to has to be able to erase it.
export async function DELETE(request) {
  const session = await getSession().catch(() => null);
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    if (q) {
      await db.prepare('DELETE FROM search_history WHERE user_id = ? AND query = ?')
        .bind(session.userId, q).run();
    } else {
      await db.prepare('DELETE FROM search_history WHERE user_id = ?')
        .bind(session.userId).run();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Clear search history failed:', e?.message || e);
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
  }
}

// POST — record a search query
export async function POST(request) {
  const session = await getSession().catch(() => null);
  if (!session?.userId) return NextResponse.json({ ok: true });

  const { query, resultCount } = await request.json();

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { recordSearch } = await import('../../../../lib/taste');
    const db = getDB();

    await recordSearch(db, session.userId, query, resultCount || 0);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
