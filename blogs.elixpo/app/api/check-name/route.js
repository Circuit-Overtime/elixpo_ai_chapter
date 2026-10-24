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
    // The org form also asks Accounts (see orgNameConflict). Accounts calls this
    // route without `for=org` to look up org names, so the plain form must stay
    // DB-only or the two services would query each other in a loop.
    if (result.available && searchParams.get('for') === 'org') {
      const { orgNameConflict } = await import('../../../lib/namespace');
      const conflict = await orgNameConflict(db, name);
      if (conflict) return NextResponse.json({ available: false, takenBy: 'user', error: conflict });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ available: false, error: 'Availability check unavailable' }, { status: 503 });
  }
}
