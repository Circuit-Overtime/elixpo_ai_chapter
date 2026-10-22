'use client';

import { useEffect, useState } from 'react';

export default function TopicPreferences() {
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    fetch('/api/users/me/interests')
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setInterests(data.interests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const remove = async tag => {
    setBusy(tag);
    try {
      const response = await fetch('/api/users/me/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: [tag] }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setInterests(data.interests || []);
    } finally {
      setBusy('');
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Topics you follow</h3>
      <p className="mb-4 text-[11px] text-[var(--text-faint)]">These explicit interests shape your feed. Add them from topic chips on published stories.</p>
      {loading ? (
        <div className="h-9 w-44 animate-pulse rounded-full bg-[var(--bg-elevated)]" />
      ) : interests.length ? (
        <div className="flex flex-wrap gap-2">
          {interests.map(tag => (
            <button key={tag} type="button" disabled={busy === tag} onClick={() => remove(tag)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-red-400/40 hover:text-red-400 disabled:opacity-50" title={`Remove ${tag} from your interests`}>
              #{tag}<ion-icon name="close-outline" style={{ fontSize: '13px' }} />
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-5 text-[12px] text-[var(--text-muted)]">No explicit topics yet. Use the + chips on a story to teach your feed what you want to read.</p>
      )}
    </section>
  );
}
