import { type NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  await destroySession();
  return NextResponse.json({ success: true });
}
