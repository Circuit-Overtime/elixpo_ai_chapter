export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession, clearSession } from '../../../../../lib/auth';

// POST — disable (deactivate) account
export async function POST() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    const user = await db.prepare('SELECT email, display_name FROM users WHERE id = ?').bind(session.userId).first();

    await db.prepare(
      "UPDATE users SET account_status = 'disabled', updated_at = ? WHERE id = ?"
    ).bind(now, session.userId).run();

    // Send disable confirmation email
    if (user?.email) {
      try {
        const { sendAccountDisabled } = await import('../../../../../lib/email');
        sendAccountDisabled(user.email, { displayName: user.display_name }).catch(() => {});
      } catch {}
    }

    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Disable account error:', e);
    return NextResponse.json({ error: 'Failed to disable account' }, { status: 500 });
  }
}
