export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { safeRelativeRedirect } from '../../../lib/safeRedirect';

export default async function SignIn({ searchParams }) {
  const params = await searchParams;
  const next = safeRelativeRedirect(params?.next);
  redirect(next ? `/api/auth/login?next=${encodeURIComponent(next)}` : '/api/auth/login');
}
