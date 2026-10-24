export const runtime = 'edge';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const parsed = Number(searchParams.get('limit') || '30');
  const limit = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 30;

  try {
    const { kvCache } = await import('../../../../lib/cache');
    const data = await kvCache(`v1:tags:popular:${limit}`, 900, async () => {
      const { getDB } = await import('../../../../lib/cloudflare');
      const db = getDB();
      const result = await db.prepare(
        'SELECT tag, COUNT(*) as count FROM blog_tags GROUP BY tag ORDER BY count DESC LIMIT ?'
      ).bind(limit).all();
      return { tags: result?.results || [] };
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
