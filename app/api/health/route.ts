import { NextResponse } from 'next/server';
import { getDB, getKV } from '@/lib/db';

export const runtime = 'edge';

/**
 * GET /api/health
 *
 * Lightweight health probe for uptime monitors (UptimeRobot, BetterStack,
 * Cloudflare Monitors, etc.). Returns 200 if every backing dependency is
 * reachable, 503 otherwise.
 *
 * Each dependency is checked independently and timeboxed, so a slow KV
 * can't make D1 look unhealthy. Response is JSON so monitors can parse
 * individual subsystem status.
 *
 * Public, no auth required, no rate limiting — uptime tooling polls this
 * every 30-60s and would fail on either of those.
 */
export async function GET() {
  const startedAt = performance.now();
  const [db, kv] = await Promise.all([
    pingDB(),
    pingKV(),
  ]);

  const status: 'ok' | 'degraded' = db.status === 'ok' && kv.status === 'ok' ? 'ok' : 'degraded';
  const httpStatus = status === 'ok' ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      latency_ms: Math.round(performance.now() - startedAt),
      checks: { db, kv },
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        // Allow uptime probes from anywhere — the response carries no
        // sensitive data.
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

interface HealthCheck {
  status: 'ok' | 'fail';
  latency_ms: number;
}

async function pingDB(): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    const db = getDB();
    // Single-row SELECT 1 with a 2s ceiling — anything slower is "degraded"
    // from a probe's point of view.
    const result = await Promise.race([
      db.prepare('SELECT 1 as ok').first<{ ok: number }>(),
      timeoutFail<'fail'>(2000, 'fail'),
    ]);
    return {
      status: result !== 'fail' && result?.ok === 1 ? 'ok' : 'fail',
      latency_ms: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { status: 'fail', latency_ms: Math.round(performance.now() - startedAt) };
  }
}

async function pingKV(): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    const kv = getKV();
    // KV.get on a missing key is the cheapest call. We don't care about the
    // value — only that the binding responds.
    const result = await Promise.race([
      kv.get('__health__'),
      timeoutFail<'fail'>(2000, 'fail'),
    ]);
    return {
      status: result === 'fail' ? 'fail' : 'ok',
      latency_ms: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { status: 'fail', latency_ms: Math.round(performance.now() - startedAt) };
  }
}

function timeoutFail<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
