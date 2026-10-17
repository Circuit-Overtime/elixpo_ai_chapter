import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';
import AuthorizeCliClient from './AuthorizeCliClient';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Authorize the Lixrl CLI',
  description: 'Review and approve a secure Lixrl Developer CLI API key.',
  robots: { index: false, follow: false },
};

export default async function AuthorizeCliPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request: requestId } = await searchParams;
  const returnTo = `/cli/authorize?request=${encodeURIComponent(requestId || '')}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);

  const db = getDB();
  const authRequest = requestId
    ? await db.prepare(
      `SELECT id, status FROM cli_auth_requests
       WHERE id = ? AND user_id = ? AND datetime(expires_at) > datetime('now')`,
    ).bind(requestId, user.id).first<{ id: string; status: string }>()
    : null;

  if (!authRequest || authRequest.status !== 'pending') {
    return (
      <main className="theme-light flex min-h-screen items-center justify-center bg-[#fafafa] px-5 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center shadow-[0_22px_70px_rgba(0,0,0,0.08)]">
          <h1 className="text-2xl font-black text-[#111]">This CLI request is unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#666]">It may have expired, been denied, or already been used. Run <code className="font-mono text-[#222]">lixrl login</code> again.</p>
          <Link href="/docs/cli" className="mt-6 inline-flex text-sm font-bold text-[#c62828]">Read the CLI guide</Link>
        </div>
      </main>
    );
  }

  const keyCount = await db.prepare(
    `SELECT COUNT(*) as count FROM api_keys
     WHERE user_id = ? AND is_active = 1
     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  ).bind(user.id).first<{ count: number }>();
  const limits = TIER_LIMITS[user.tier];

  return (
    <main className="theme-light min-h-screen bg-[#fafafa] px-5 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[#222] no-underline">
          <img src="/base_logo.png" alt="Lixrl" width={30} height={30} className="rounded-md" />
          Lixrl
        </Link>
        <AuthorizeCliClient
          requestId={authRequest.id}
          defaultName="Lixrl CLI"
          activeKeys={keyCount?.count || 0}
          maxKeys={limits.maxApiKeys}
        />
        <p className="mt-5 text-center text-xs leading-5 text-[#888]">Approve only if you started this login from your own terminal. The request expires after ten minutes.</p>
      </div>
    </main>
  );
}
