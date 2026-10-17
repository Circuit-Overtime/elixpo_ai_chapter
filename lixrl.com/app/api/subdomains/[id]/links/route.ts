import { NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { bumpSubdomainRevision } from '@/lib/subdomain-control';
import { validateSlug } from '@/lib/validate';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  const { results } = await getDB()
    .prepare(
      `SELECT dl.id, dl.short_code, dl.url_id, dl.created_at,
              u.short_code AS fallback_code, u.original_url, u.title
       FROM subdomain_links dl
       JOIN subdomains s ON s.id = dl.subdomain_id
       JOIN urls u ON u.id = dl.url_id
       WHERE dl.subdomain_id = ? AND s.user_id = ?
       ORDER BY dl.created_at DESC`,
    )
    .bind(id, user.id)
    .all();
  return NextResponse.json({ links: results || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid subdomain id' }, { status: 400 });
  const body = await request.json().catch(() => null) as { url_code?: unknown; short_code?: unknown } | null;
  if (!body || typeof body.url_code !== 'string') {
    return NextResponse.json({ error: 'url_code is required' }, { status: 400 });
  }
  const brandedCode = typeof body.short_code === 'string' && body.short_code
    ? body.short_code.toLowerCase()
    : body.url_code.toLowerCase();
  const slugError = validateSlug(brandedCode);
  if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });

  const db = getDB();
  const domain = await db
    .prepare("SELECT hostname FROM subdomains WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(id, user.id)
    .first<{ hostname: string }>();
  if (!domain) return NextResponse.json({ error: 'Active subdomain not found' }, { status: 404 });
  const url = await db
    .prepare('SELECT id, short_code FROM urls WHERE user_id = ? AND short_code = ?')
    .bind(user.id, body.url_code)
    .first<{ id: number; short_code: string }>();
  if (!url) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  try {
    await db
      .prepare('INSERT INTO subdomain_links (subdomain_id, url_id, short_code) VALUES (?, ?, ?)')
      .bind(id, url.id, brandedCode)
      .run();
    await bumpSubdomainRevision(db, id);
  } catch {
    return NextResponse.json({ error: 'This code or link is already assigned on the subdomain' }, { status: 409 });
  }
  auditLog(user.id, 'subdomain.link', 'subdomain', String(id), `${domain.hostname}/${brandedCode}`).catch(() => {});
  return NextResponse.json({
    short_url: `https://${domain.hostname}/${brandedCode}`,
    fallback_url: `https://lixrl.com/${url.short_code}`,
    short_code: brandedCode,
  }, { status: 201 });
}
