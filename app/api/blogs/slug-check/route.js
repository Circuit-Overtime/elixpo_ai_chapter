export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// GET /api/blogs/slug-check?slug=&publishAs=&excludeId=
// Availability of a slug within the chosen owner scope (personal or org:<id>).
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ available: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim().toLowerCase();
  const publishAs = searchParams.get('publishAs') || 'personal';
  const excludeId = searchParams.get('excludeId') || undefined;

  if (!slug) return NextResponse.json({ available: false, reason: 'Enter a slug.' });
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ available: false, reason: 'Lowercase letters, numbers and hyphens only.' });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { checkBlogSlugAvailable } = await import('../../../../lib/namespace');
    const db = getDB();
    const { available } = await checkBlogSlugAvailable(db, slug, excludeId, {
      authorId: session.userId,
      publishAs,
    });
    return NextResponse.json(available ? { available: true } : { available: false, reason: 'Taken in this space.' });
  } catch {
    return NextResponse.json({ available: false, reason: 'Could not check right now.' });
  }
}
