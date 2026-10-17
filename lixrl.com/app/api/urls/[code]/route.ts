import { NextRequest, NextResponse } from 'next/server';
import { resolveUser, auditLog } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB, getEnv, getKV } from '@/lib/db';
import { validateUrl, validateLength, validateFutureDate, badRequest } from '@/lib/validate';
import { TIER_LIMITS, type UrlRecord } from '@/lib/types';
import { checkSafeBrowsing, threatMessage } from '@/lib/safebrowsing';
import { putRedirectCache } from '@/lib/redirect-cache';
import { bumpSubdomainRevisionsForUrl } from '@/lib/subdomain-control';

export const runtime = 'edge';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const db = getDB();
  const url = await db.prepare('SELECT * FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id).first<UrlRecord>();

  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(url);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return badRequest('Request body must be valid JSON');
  const db = getDB();
  const kv = getKV();

  const url = await db.prepare('SELECT * FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id).first<UrlRecord>();
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const bindParams: any[] = [];

  if (body.url !== undefined) {
    if (typeof body.url !== 'string') return badRequest('url must be a string');
    const urlErr = validateUrl(body.url);
    if (urlErr) return badRequest(urlErr);
    const threat = await checkSafeBrowsing(body.url, getEnv().SAFE_BROWSING_API_KEY);
    if (threat) {
      return NextResponse.json({ error: threatMessage(threat) }, { status: 422 });
    }
    updates.push('original_url = ?'); bindParams.push(body.url);
  }
  if (body.title !== undefined) {
    if (body.title !== null && typeof body.title !== 'string') return badRequest('title must be a string or null');
    if (body.title) {
      const titleErr = validateLength(body.title, 'Title', 1, 255);
      if (titleErr) return badRequest(titleErr);
    }
    updates.push('title = ?'); bindParams.push(body.title);
  }
  if (body.campaign !== undefined) {
    if (body.campaign !== null && typeof body.campaign !== 'string') return badRequest('campaign must be a string or null');
    if (body.campaign) {
      const campaignError = validateLength(body.campaign.trim(), 'Campaign', 1, 64);
      if (campaignError) return badRequest(campaignError);
    }
    updates.push('campaign = ?'); bindParams.push(body.campaign?.trim() || null);
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 10) return badRequest('tags must be an array of up to 10 strings');
    const normalizedTags = (body.tags as unknown[]).map((tag) =>
      typeof tag === 'string' ? tag.trim().toLowerCase() : ''
    );
    const tags = Array.from(new Set(normalizedTags)).filter((tag) => tag.length > 0);
    if (tags.some((tag) => tag.length > 24)) return badRequest('each tag must be 24 characters or fewer');
    updates.push('tags = ?'); bindParams.push(tags.length ? JSON.stringify(tags) : null);
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return badRequest('is_active must be a boolean');
    updates.push('is_active = ?'); bindParams.push(body.is_active ? 1 : 0);
  }
  if (body.expires_at !== undefined) {
    if (body.expires_at !== null && !TIER_LIMITS[user.tier].expiringLinks) {
      return NextResponse.json({ error: 'Expiring links require Pro tier or above' }, { status: 403 });
    }
    if (body.expires_at !== null) {
      if (typeof body.expires_at !== 'string') return badRequest('expires_at must be a string or null');
      const dateErr = validateFutureDate(body.expires_at);
      if (dateErr) return badRequest(dateErr);
    }
    updates.push('expires_at = ?'); bindParams.push(body.expires_at);
  }

  if (updates.length === 0) return badRequest('No fields to update');

  updates.push("updated_at = datetime('now')");
  bindParams.push(code, user.id);

  await db.prepare(`UPDATE urls SET ${updates.join(', ')} WHERE short_code = ? AND user_id = ?`)
    .bind(...bindParams).run();
  await bumpSubdomainRevisionsForUrl(db, url.id);

  // Sync KV cache
  const newUrl = body.url || url.original_url;
  const isActive = body.is_active !== undefined ? body.is_active : !!url.is_active;
  const newExpiry = body.expires_at !== undefined ? body.expires_at : url.expires_at;
  if (isActive) {
    putRedirectCache(kv, code, {
      url: newUrl,
      id: url.id,
      expires_at: newExpiry,
    }).catch(() => {});
  } else {
    kv.delete(`url:${code}`).catch(() => {});
  }

  auditLog(user.id, 'url.update', 'url', code).catch(() => {});
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const db = getDB();
  const kv = getKV();

  const url = await db.prepare('SELECT id FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id).first<{ id: number }>();
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await bumpSubdomainRevisionsForUrl(db, url.id);
  await db.prepare('DELETE FROM urls WHERE short_code = ? AND user_id = ?').bind(code, user.id).run();
  kv.delete(`url:${code}`).catch(() => {});
  auditLog(user.id, 'url.delete', 'url', code).catch(() => {});

  return NextResponse.json({ success: true });
}
