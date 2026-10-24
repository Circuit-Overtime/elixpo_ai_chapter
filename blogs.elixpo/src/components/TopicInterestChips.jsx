'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TopicInterestChips({ tags = [] }) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const [interests, setInterests] = useState([]);
  const [interestsLoaded, setInterestsLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const normalized = useMemo(() => [...new Set(tags.map(tag => String(tag).trim()).filter(Boolean))], [tags]);
  const interestSet = useMemo(() => new Set(interests.map(item => String(item).toLowerCase())), [interests]);

  useEffect(() => {
    if (loading) return undefined;
    if (!userId) {
      setInterests([]);
      setInterestsLoaded(true);
      return undefined;
    }
    const controller = new AbortController();
    setInterestsLoaded(false);
    fetch('/api/users/me/interests', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setInterests(data.interests || []))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setInterestsLoaded(true);
      });
    return () => controller.abort();
  }, [loading, userId]);

  useEffect(() => {
    const sync = event => {
      if (Array.isArray(event.detail?.interests)) {
        setInterests(event.detail.interests);
        setInterestsLoaded(true);
      }
    };
    window.addEventListener('lixblogs:interests-changed', sync);
    return () => window.removeEventListener('lixblogs:interests-changed', sync);
  }, []);

  const toggleInterest = async tag => {
    if (loading) return;
    if (!userId) {
      window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const key = tag.toLowerCase();
    if (!interestsLoaded) return;
    const active = interestSet.has(key);
    setBusy(key);
    try {
      const response = await fetch('/api/users/me/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active ? { remove: [tag] } : { add: [tag] }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setInterests(data.interests || []);
        window.dispatchEvent(new CustomEvent('lixblogs:interests-changed', { detail: { interests: data.interests || [] } }));
        setMessage(active ? `Removed #${tag} from your interests` : `Added #${tag} to your interests`);
      } else {
        setMessage(data.error || 'This topic preference could not be updated');
      }
      setTimeout(() => setMessage(''), 2200);
    } finally {
      setBusy('');
    }
  };

  if (!normalized.length) return null;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Story topics">
        {normalized.map(tag => {
          const active = interestsLoaded && interestSet.has(tag.toLowerCase());
          const pending = Boolean(userId) && !interestsLoaded;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              disabled={busy === tag.toLowerCase() || pending}
              onClick={() => toggleInterest(tag)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-wait disabled:opacity-70"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                borderColor: active ? 'color-mix(in srgb, var(--accent) 30%, var(--border-default))' : 'var(--border-default)',
              }}
              title={pending ? 'Checking your interests…' : active ? `Remove ${tag} from your interests` : `Add ${tag} to your interests`}
            >
              <span>#{tag}</span>
              <ion-icon name={pending ? 'ellipsis-horizontal' : active ? 'checkmark' : 'add'} style={{ fontSize: '13px' }} />
            </button>
          );
        })}
      </div>
      {message && <p className="mt-1.5 text-[11px] font-medium text-[var(--accent)]" role="status">{message}</p>}
    </div>
  );
}
