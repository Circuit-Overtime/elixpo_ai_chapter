'use client';

import { useEffect } from 'react';

export default function CallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      window.location.href = '/auth-error?code=' + encodeURIComponent(params.get('error'));
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center">
      <div className="text-center">
        <div className="h-14 w-14 mx-auto rounded-full bg-[url('/logo.png')] bg-cover mb-6" />
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Completing sign in...</h2>
        <p className="text-[#777] text-sm mb-6">Please wait while we verify your identity.</p>
        <div className="h-5 w-5 mx-auto border-2 border-[#e8e8e8] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
