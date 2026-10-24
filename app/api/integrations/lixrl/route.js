export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getDB } from '../../../../lib/cloudflare';
import { callLixrl } from '../../../../lib/lixrl';

async function currentUser() {
  const session = await getSession();
  if (!session?.userId) return null;
  return getDB().prepare(
    'SELECT id, email, username, display_name, avatar_url FROM users WHERE id = ?',
  ).bind(session.userId).first();
}

async function proxy(action, user, payload) {
  try {
    const { response, data } = await callLixrl(action, user, payload);
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    console.error('[lixrl] Integration request failed:', timedOut ? 'timeout' : error?.message || error);
    return NextResponse.json(
      { error: timedOut ? 'LixRL did not respond in time' : 'LixRL is temporarily unavailable' },
      { status: 502 },
    );
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return proxy('status', user);
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body?.action === 'connect') return proxy('connect', user);
  if (body?.action !== 'shorten') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  if (typeof body.url !== 'string' || body.url.length > 4096) {
    return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 });
  }
  return proxy('shorten', user, {
    url: body.url,
    title: typeof body.title === 'string' ? body.title.slice(0, 255) : undefined,
  });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return proxy('disconnect', user);
}
