export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getDB } from '../../../../lib/cloudflare';
import { pollinationsEnabled, publicConnection, refreshPollinationsConnection } from '../../../../lib/pollinations';

async function context() {
  const session = await getSession();
  return session?.userId ? { userId: session.userId, db: getDB() } : null;
}

async function connection(db, userId) {
  return db.prepare('SELECT * FROM pollinations_connections WHERE user_id = ?').bind(userId).first();
}

export async function GET(request) {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!pollinationsEnabled()) return NextResponse.json({ enabled: false, comingSoon: true, ...publicConnection(null) });
  try {
    let row = await connection(auth.db, auth.userId);
    row = await refreshPollinationsConnection(auth.db, row, { force: new URL(request.url).searchParams.get('refresh') === '1' });
    return NextResponse.json({ enabled: true, comingSoon: false, ...publicConnection(row) });
  } catch (error) {
    const missingTable = String(error?.message || '').includes('no such table');
    return NextResponse.json({ error: missingTable ? 'Pollinations migration is not applied' : 'Unable to load Pollinations connection' }, { status: 503 });
  }
}

export async function DELETE() {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await auth.db.prepare('DELETE FROM pollinations_connections WHERE user_id = ?').bind(auth.userId).run();
  return NextResponse.json({ enabled: pollinationsEnabled(), comingSoon: !pollinationsEnabled(), ...publicConnection(null) });
}
