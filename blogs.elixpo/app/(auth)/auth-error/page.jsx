export const runtime = 'edge';

import Link from 'next/link';

export const metadata = {
  title: 'Account connection interrupted',
  robots: { index: false, follow: false },
};

const MESSAGES = {
  access_denied: 'The authorization request was cancelled.',
  token_exchange_failed: 'Elixpo Accounts could not complete the secure sign-in exchange.',
  invalid_state: 'The authorization session expired. Start again to create a fresh session.',
  missing_code: 'Elixpo Accounts did not return an authorization code.',
  user_info_failed: 'Your profile could not be read from Elixpo Accounts.',
  account_deleted: 'This account has been permanently deleted and cannot be recovered.',
  oauth_not_configured: 'Sign-in is temporarily unavailable because the LixBlogs account connection is not configured.',
  server: 'LixBlogs could not create a secure session.',
};

export default async function AuthError({ searchParams }) {
  const params = await searchParams;
  const message = MESSAGES[params?.code] || 'The account connection could not be completed.';
  const canRetry = params?.code !== 'oauth_not_configured';

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-app)' }}>
      <section className="w-full max-w-md rounded-2xl p-7 text-center" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <img src="/logo-mark.png" alt="LixBlogs" className="h-12 w-12 mx-auto rounded-full mb-4" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Account connection interrupted</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <p className="mt-4 rounded-xl px-4 py-3 text-xs leading-5" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          Authentication is handled only by <strong>accounts.elixpo.com</strong>. LixBlogs never asks for or stores your account password.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {canRetry && <Link href="/api/auth/login" className="rounded-full bg-[#9b7bf7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#8b6ae6]">Try again securely</Link>}
          <Link href="/" className="rounded-full px-5 py-2.5 text-sm font-medium" style={{ border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>Return home</Link>
        </div>
      </section>
    </main>
  );
}
