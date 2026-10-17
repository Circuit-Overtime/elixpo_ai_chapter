'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCode, fetchUser, saveAuth, getSignInUrl } from '../../lib/auth';
import styles from './Callback.module.css';

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('Signing you in...');
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setPhase('error');
      setMessage('Sign in was denied');
      setErrorDetail('You cancelled the sign in request.');
      return;
    }

    if (!code) {
      setPhase('error');
      setMessage('Missing authorization code');
      setErrorDetail('No code was returned from the auth server.');
      return;
    }

    const savedState = sessionStorage.getItem('oauth_state');

    // Warn on state mismatch but still proceed — some browsers clear
    // sessionStorage during cross-origin redirects.
    if (state && savedState && state !== savedState) {
      console.warn('[auth] OAuth state mismatch — proceeding anyway', { state, savedState });
    }

    // Clear consumed state
    sessionStorage.removeItem('oauth_state');

    (async () => {
      try {
        setMessage('Exchanging credentials...');
        const tokens = await exchangeCode(code);

        if (!tokens.access_token) {
          throw new Error(tokens.error_description || tokens.error || 'No access token returned');
        }

        setMessage('Fetching your profile...');
        const user = await fetchUser(tokens.access_token);
        saveAuth(tokens, user);

        setPhase('success');
        setMessage(`Welcome back, ${user.displayName || user.name || 'Creator'}!`);

        setTimeout(() => router.push('/generate'), 1500);
      } catch (err) {
        console.error('[auth] Sign-in error:', err);
        setPhase('error');
        setMessage('Sign in failed');
        setErrorDetail(err.message || 'An unexpected error occurred.');
      }
    })();
  }, [searchParams, router]);

  return (
    <div className={styles.page}>
      {/* Animated brush blobs */}
      <div className={styles.canvas} aria-hidden="true">
        <div className={styles.blob} />
        <div className={styles.blob} />
        <div className={styles.blob} />
        <div className={styles.blob} />
        <div className={styles.blob} />
      </div>

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <img src="/logo.png" alt="Elixpo" className={styles.logo} />
        </div>

        {/* Loading state */}
        {phase === 'loading' && (
          <>
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
            </div>
            <p className={styles.status}>{message}</p>
            <p className={styles.hint}>This will only take a moment</p>
          </>
        )}

        {/* Success state */}
        {phase === 'success' && (
          <>
            <div className={styles.successIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className={styles.title}>{message}</h2>
            <p className={styles.hint}>Redirecting you to the studio...</p>
          </>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <>
            <div className={styles.errorIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className={styles.title}>{message}</h2>
            <p className={styles.errorDetail}>{errorDetail}</p>

            <div className={styles.actions}>
              <a href={getSignInUrl()} className={styles.primaryBtn}>
                Try Again
              </a>
              <a href="/" className={styles.secondaryBtn}>
                Go Home
              </a>
            </div>
          </>
        )}
      </div>

      <p className={styles.footer}>Elixpo Art — AI-Powered Creative Platform</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="page" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)',
        fontFamily: 'var(--font-family-primary)',
      }}>Loading...</div>
    }>
      <CallbackInner />
    </Suspense>
  );
}
