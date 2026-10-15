export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { validateNameFormat } from '../../../lib/namespace';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').trim().toLowerCase();

  // Format validation (no DB hit)
  const fmt = validateNameFormat(name);
  if (!fmt.valid) {
    return NextResponse.json({ available: false, error: fmt.error });
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const { checkNameAvailable } = await import('../../../lib/namespace');
    const db = getDB();
    const result = await checkNameAvailable(db, name);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ available: false, error: 'Availability check unavailable' }, { status: 503 });
  }
}
