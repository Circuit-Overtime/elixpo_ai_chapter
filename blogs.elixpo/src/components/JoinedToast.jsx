'use client';

import { useState, useEffect } from 'react';

// One-shot toast shown after an org-join redirect (?joined=1 or ?joined=member).
// Reads the flag once, then strips it from the URL so a refresh won't re-show it.
export default function JoinedToast() {
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const j = sp.get('joined');
    if (!j) return;
    setMsg(j === 'member' ? "You're already a member of this organization." : 'Welcome — you joined the organization! 🎉');
    sp.delete('joined');
    const qs = sp.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!msg) return null;
  return (
    <div
      style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 300, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
      className="px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-2xl flex items-center gap-2"
    >
      <ion-icon name="checkmark-circle" style={{ fontSize: '17px', color: '#4ade80' }} />
      <span style={{ color: 'var(--text-primary)' }}>{msg}</span>
    </div>
  );
}
