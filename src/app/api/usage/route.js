import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { DAILY_CREDITS, getCost } from '../../lib/credits';

// In-memory credit store (resets on restart — D1 replaces in production)
const creditStore = new Map();

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getEntry(key, tier) {
  const today = getTodayUTC();
  const entry = creditStore.get(key);
  if (!entry || entry.date !== today) {
    const dailyTotal = DAILY_CREDITS[tier] || DAILY_CREDITS.guest;
    const fresh = { creditsUsed: 0, dailyTotal, date: today };
    creditStore.set(key, fresh);
    return fresh;
  }
  return entry;
}

function getClientIP(headersList) {
  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headersList.get('x-real-ip') || 'unknown';
}

// GET /api/usage — check credit balance
export async function GET(request) {
  const headersList = await headers();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const tier = searchParams.get('tier') || 'guest';
  const ip = getClientIP(headersList);
  const key = userId ? `user:${userId}` : `ip:${ip}`;
  const entry = getEntry(key, tier);

  return NextResponse.json({
    credits: entry.dailyTotal - entry.creditsUsed,
    creditsUsed: entry.creditsUsed,
    dailyTotal: entry.dailyTotal,
    tier,
  });
}

// POST /api/usage — spend credits
// Body: { action: 'image'|'video'|'edit'|'enhance'|'describe'|'blueprint', model?: string, userId?, tier? }
export async function POST(request) {
  const headersList = await headers();
  const body = await request.json();
  const { action, model, userId, tier: bodyTier } = body;

  if (!action) {
    return NextResponse.json({ error: 'Action is required' }, { status: 400 });
  }

  const ip = getClientIP(headersList);
  const key = userId ? `user:${userId}` : `ip:${ip}`;
  const tier = bodyTier || (userId ? 'free' : 'guest');
  const entry = getEntry(key, tier);
  const cost = getCost(action, model);
  const remaining = entry.dailyTotal - entry.creditsUsed;

  if (cost > remaining) {
    return NextResponse.json({
      error: `Not enough credits. This action costs ${cost} credits, you have ${remaining} remaining.`,
      credits: remaining,
      cost,
      dailyTotal: entry.dailyTotal,
      tier,
    }, { status: 429 });
  }

  entry.creditsUsed += cost;
  creditStore.set(key, entry);

  return NextResponse.json({
    allowed: true,
    cost,
    credits: entry.dailyTotal - entry.creditsUsed,
    creditsUsed: entry.creditsUsed,
    dailyTotal: entry.dailyTotal,
    tier,
  });
}
