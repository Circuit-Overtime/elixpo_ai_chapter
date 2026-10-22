export const runtime = 'edge';

import { enforceAILimits } from '../../../../lib/aiRateLimit';
import { getDB } from '../../../../lib/cloudflare';
import { deletePollinationsReference, decryptPollinationsToken, POLLINATIONS_MODELS, providerError, uploadPollinationsReference } from '../../../../lib/pollinations';
import { isAllowedMime } from '../../../../src/utils/allowedImageTypes';

const ALLOWED_MODELS = new Set(POLLINATIONS_MODELS);

export async function POST(request) {
  // Generation uses the creator's connected Pollinations account. Access is
  // available on every LixBlogs tier; this guard only authenticates the caller
  // and applies the tier's daily abuse limit.
  const { session, error } = await enforceAILimits({ request });
  if (error) return error;

  let db;
  let attemptId;
  let startedAt;
  let providerToken;
  let temporaryReference;
  try {
    const contentType = request.headers.get('content-type') || '';
    let input;
    let referenceFile = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      input = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
      referenceFile = form.get('referenceImage');
      if (!referenceFile || typeof referenceFile.arrayBuffer !== 'function' || typeof referenceFile.size !== 'number') referenceFile = null;
    } else input = await request.json();
    const { prompt, model = 'flux', generationId, destination = 'inline' } = input;
    const seed = input.seed === undefined || input.seed === '' ? undefined : Number(input.seed);
    const width = input.width === undefined || input.width === '' ? undefined : Number(input.width);
    const height = input.height === undefined || input.height === '' ? undefined : Number(input.height);
    const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!cleanPrompt || cleanPrompt.length > 1000) {
      return Response.json(
        { error: cleanPrompt ? 'Prompt must be 1000 characters or fewer' : 'Missing prompt' },
        { status: 400 },
      );
    }
    if (!ALLOWED_MODELS.has(model)) {
      return Response.json({ error: 'Unsupported image model' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(generationId || '')) {
      return Response.json({ error: 'A valid generationId is required' }, { status: 400 });
    }
    db = getDB();
    const connection = await db.prepare("SELECT * FROM pollinations_connections WHERE user_id = ? AND status = 'connected'")
      .bind(session.userId).first();
    if (!connection || (connection.expires_at && connection.expires_at <= Math.floor(Date.now() / 1000))) {
      return Response.json({ error: 'Connect or reconnect Pollinations in Settings', code: 'pollinations_reconnect_required' }, { status: 409 });
    }
    let permittedModels = [];
    try { permittedModels = JSON.parse(connection.permitted_models || '[]'); } catch {}
    if (!permittedModels.includes(model)) return Response.json({ error: 'This model was not approved for the connection', code: 'permission_denied' }, { status: 403 });
    if (referenceFile && (!isAllowedMime(referenceFile.type) || referenceFile.size > 10 * 1024 * 1024)) {
      return Response.json({ error: 'Reference image must be a supported image up to 10 MB' }, { status: 400 });
    }
    const reserved = await db.prepare(`INSERT OR IGNORE INTO pollinations_generation_attempts
      (id, user_id, model, destination, status, created_at) VALUES (?, ?, ?, ?, 'started', unixepoch())`)
      .bind(generationId, session.userId, model, String(destination).slice(0, 32)).run();
    if (!reserved.meta?.changes) {
      return Response.json({ error: 'This generation was already submitted', code: 'duplicate_generation' }, { status: 409 });
    }
    attemptId = generationId;

    const apiKey = await decryptPollinationsToken(connection);
    providerToken = apiKey;
    const actualSeed = Number.isInteger(seed) ? Math.max(0, Math.min(seed, 2147483647)) : Math.floor(Math.random() * 1000000000);
    const query = new URLSearchParams({ model, seed: String(actualSeed), nologo: 'true' });
    if (Number.isInteger(width) && width >= 256 && width <= 2048) query.set('width', String(width));
    if (Number.isInteger(height) && height >= 256 && height <= 2048) query.set('height', String(height));
    if (referenceFile) {
      temporaryReference = await uploadPollinationsReference(apiKey, referenceFile);
      query.set('image', temporaryReference.url);
    }
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(cleanPrompt)}?${query}`;
    startedAt = Date.now();
    const imgRes = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(90000),
    });
    if (!imgRes.ok) {
      const mapped = providerError(imgRes.status);
      await db.prepare("UPDATE pollinations_generation_attempts SET status='failed', provider_status=?, error_code=?, duration_ms=?, completed_at=unixepoch() WHERE id=?")
        .bind(imgRes.status, mapped.code, Date.now() - startedAt, generationId).run();
      if (mapped.code === 'revoked') await db.prepare("UPDATE pollinations_connections SET status='revoked', last_error_code='revoked', updated_at=unixepoch() WHERE user_id=?").bind(session.userId).run();
      const status = [401, 402, 403, 429].includes(imgRes.status) ? imgRes.status : 502;
      return Response.json(
        { error: mapped.code === 'insufficient_pollen' ? 'Insufficient Pollen. Top up in Pollinations.' : mapped.code === 'permission_denied' ? 'This model is outside the approved Pollinations connection.' : mapped.code === 'rate_limited' ? 'Pollinations is rate limited. Try later; this request was not retried.' : mapped.code === 'revoked' ? 'Pollinations access was revoked. Reconnect in Settings.' : 'Image generation service unavailable', code: mapped.code },
        { status },
      );
    }

    const bytes = await imgRes.arrayBuffer();
    await db.prepare("UPDATE pollinations_generation_attempts SET status='completed', provider_status=200, duration_ms=?, completed_at=unixepoch() WHERE id=?")
      .bind(Date.now() - startedAt, generationId).run();

    return new Response(bytes, {
      headers: {
        'Content-Type': imgRes.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[ai/image] generation failed:', err?.name || 'Error');
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    if (db && attemptId) {
      try {
        await db.prepare("UPDATE pollinations_generation_attempts SET status='failed', error_code=?, duration_ms=?, completed_at=unixepoch() WHERE id=? AND status='started'")
          .bind(timeout ? 'provider_timeout' : 'generation_failed', startedAt ? Date.now() - startedAt : null, attemptId).run();
      } catch {}
    }
    return Response.json({ error: timeout ? 'Pollinations timed out. The request was not retried.' : 'Image generation failed', code: timeout ? 'provider_timeout' : 'generation_failed' }, { status: timeout ? 504 : 500 });
  } finally {
    if (providerToken && temporaryReference) await deletePollinationsReference(providerToken, temporaryReference);
  }
}
