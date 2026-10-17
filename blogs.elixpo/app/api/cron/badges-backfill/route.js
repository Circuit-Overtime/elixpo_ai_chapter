export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { evaluateCreatorBadges } from '../../../../lib/creatorBadges';

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;

/**
 * POST /api/cron/badges-backfill
 *
 * Evaluates one bounded page of existing creators. Callers continue with the
 * returned cursor until `done` is true. Award and notification writes are
 * idempotent, so interrupted runs can safely restart from the beginning.
 */
export async function POST(request) {
  const secret = process.env.BADGE_BACKFILL_SECRET || process.env.CRON_SECRET || '';
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const cursor = typeof body.cursor === 'string' ? body.cursor : '';
  const requestedLimit = Number.parseInt(body.limit, 10);
  const limit = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_BATCH_SIZE),
  );

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const users = cursor
      ? await db.prepare('SELECT id FROM users WHERE id > ? ORDER BY id LIMIT ?').bind(cursor, limit).all()
      : await db.prepare('SELECT id FROM users ORDER BY id LIMIT ?').bind(limit).all();
    const rows = users?.results || [];
    const evaluations = await Promise.allSettled(
      rows.map(({ id }) => evaluateCreatorBadges(db, id)),
    );

    let awards = 0;
    const failures = [];
    evaluations.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        awards += result.value.newlyEarned.length;
      } else {
        failures.push({ userId: rows[index].id, error: result.reason?.message || 'Evaluation failed' });
      }
    });

    const nextCursor = rows.length ? rows[rows.length - 1].id : cursor;
    return NextResponse.json({
      ok: failures.length === 0,
      processed: rows.length,
      awards,
      failures,
      nextCursor,
      done: rows.length < limit,
    });
  } catch (error) {
    console.error('Badge backfill error:', error);
    return NextResponse.json({ error: 'Badge backfill failed' }, { status: 500 });
  }
}
