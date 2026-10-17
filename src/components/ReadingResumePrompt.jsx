'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { clearReadingProgress, readingProgressFor } from '../utils/readingProgress';

function resumable(value) {
  const progress = Number(value || 0);
  return progress >= 0.05 && progress < 0.9 ? progress : 0;
}

export default function ReadingResumePrompt({ blogId }) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!blogId || loading) return;
    let active = true;
    const readerKey = userId || 'guest';
    const localProgress = resumable(readingProgressFor(blogId, readerKey)?.progress);
    if (localProgress) {
      setProgress(localProgress);
      setVisible(true);
    }
    if (!userId) return () => { active = false; };
    fetch(`/api/blogs/${encodeURIComponent(blogId)}/progress`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active || !data) return;
        if (!data.found) return;
        const serverProgress = resumable(data.resumeProgress);
        if (serverProgress) {
          setProgress(serverProgress);
          setVisible(true);
        } else {
          clearReadingProgress(blogId, userId);
          setProgress(0);
          setVisible(false);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [blogId, loading, userId]);

  if (!visible || !progress) return null;

  const continueReading = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.max(0, scrollable * progress), behavior: 'smooth' });
    setVisible(false);
  };

  const startOver = () => {
    clearReadingProgress(blogId, userId || 'guest');
    if (userId) {
      fetch(`/api/blogs/${encodeURIComponent(blogId)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: 0, resetResume: true }),
      }).catch(() => {});
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setVisible(false);
  };

  return (
    <aside className="fixed bottom-5 left-1/2 z-[75] flex w-[calc(100vw-24px)] max-w-[500px] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]/95 p-3 shadow-2xl backdrop-blur-xl" role="status" aria-live="polite">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]">
        <ion-icon name="book-outline" style={{ fontSize: '18px' }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-[var(--text-primary)]">Continue where you left off?</p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">You reached about {Math.round(progress * 100)}% of this story.</p>
      </div>
      <button type="button" onClick={startOver} className="hidden text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] sm:block">Start over</button>
      <button type="button" onClick={continueReading} className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-[11px] font-bold text-white">Continue</button>
      <button type="button" onClick={() => setVisible(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--text-faint)] hover:bg-[var(--bg-hover)]" aria-label="Dismiss continue reading"><ion-icon name="close-outline" /></button>
    </aside>
  );
}
