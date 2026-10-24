'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    // Server route generates the CSRF state + sets an httpOnly cookie, then redirects.
    window.location.href = '/api/auth/login';
  };

  const errorMessages = {
    access_denied: 'You denied the authorization request.',
    token_exchange_failed: 'Authentication failed. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    missing_code: 'Something went wrong. Please try again.',
  };

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="h-16 w-16 mx-auto rounded-full bg-[url('/logo.png')] bg-cover mb-4" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)] font-[Kanit,serif]">LixBlogs</h1>
          <p className="text-[#888] text-sm mt-2">Sign in to start writing</p>
        </div>

        <div className="bg-[#10141E] border border-[#1D202A] rounded-2xl p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {errorMessages[error] || 'An error occurred. Please try again.'}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-[#7ba8f0] text-[#030712] font-bold rounded-xl text-sm hover:bg-[#9dc0ff] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-[#030712] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Sign in with Elixpo Accounts
              </>
            )}
          </button>

          <p className="text-[#555] text-xs text-center mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <p className="text-center text-[#555] text-xs mt-6">
          Secured by Elixpo Accounts
        </p>
      </div>
    </div>
  );
}
