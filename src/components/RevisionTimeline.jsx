'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function formatRevisionDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000));
}

// The selected revision lives in `?rev=` so refresh and Back/Forward preserve it.
function setRevisionParam(id, replace = false) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('rev', id);
  else url.searchParams.delete('rev');
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export default function RevisionTimeline({ blogId, onRevision }) {
  const revId = useSearchParams().get('rev');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [versions, setVersions] = useState([]);
  const [revisionData, setRevisionData] = useState(null);
  const [error, setError] = useState('');
  const cache = useRef(new Map());
  const listRequested = useRef(false);
  const panelRef = useRef(null);
  const revIndex = revId ? versions.findIndex(version => version.id === revId) : -1;
  const selectedIndex = revIndex >= 0 ? revIndex : Math.max(0, versions.length - 1);
  const selectedId = versions[selectedIndex]?.id;
  const isHistorical = revIndex >= 0 && revIndex < versions.length - 1;
  const historical = isHistorical && revisionData?.revision?.id === revId ? revisionData.revision : null;

  async function openTimeline() {
    setOpen(true);
    if (listRequested.current) return;
    listRequested.current = true;
    setLoadingList(true);
    setError('');
    try {
      const response = await fetch(`/api/blogs/${encodeURIComponent(blogId)}/timeline`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Revision history is unavailable');
      setVersions(data.versions || []);
      setLoaded(true);
    } catch (loadError) {
      listRequested.current = false;
      setError(loadError.message || 'Revision history is unavailable');
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (revId) openTimeline();
  }, [revId]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePress = event => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (loaded && revId && revIndex === -1) setRevisionParam(null, true);
  }, [loaded, revId, revIndex]);

  // The parent swaps the full rendered article body, not a separate diff panel.
  useEffect(() => {
    if (!isHistorical) onRevision?.(null);
    else if (historical) onRevision?.(historical);
  }, [isHistorical, historical, onRevision]);

  useEffect(() => {
    if (!open || !selectedId || !isHistorical) return undefined;
    const cached = cache.current.get(selectedId);
    if (cached) {
      setRevisionData(cached);
      setLoadingRevision(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoadingRevision(true);
    setError('');
    fetch(`/api/blogs/${encodeURIComponent(blogId)}/timeline?version=${encodeURIComponent(selectedId)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Revision could not be loaded');
        return data;
      })
      .then(data => {
        cache.current.set(selectedId, data);
        setRevisionData(data);
      })
      .catch(loadError => {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Revision could not be loaded');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRevision(false);
      });

    return () => controller.abort();
  }, [blogId, isHistorical, open, selectedId]);

  const selectedVersion = versions[selectedIndex];
  const editCount = Math.max(0, versions.length - 1);
  const spanDays = versions.length > 1
    ? Math.max(1, Math.ceil((versions.at(-1).created_at - versions[0].created_at) / 86400))
    : 0;

  return (
    <>
      <section
        ref={panelRef}
        className={`fixed bottom-4 left-3 z-[62] border backdrop-blur-xl transition-[width] sm:bottom-5 sm:left-5 ${open ? 'w-[calc(100vw-24px)] max-w-[460px] rounded-2xl p-4' : 'w-auto rounded-full p-1.5'}`}
        style={{
          borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border-default))',
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
          boxShadow: '0 12px 36px color-mix(in srgb, var(--text-primary) 12%, transparent)',
        }}
        aria-label="Story revision history"
      >
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openTimeline())}
          aria-expanded={open}
          className={`flex items-center justify-between gap-3 text-left ${open ? 'w-full' : 'rounded-full px-3 py-1.5'}`}
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ion-icon name="time-outline" aria-hidden="true" />
            {isHistorical ? 'Older revision' : 'History'}
          </span>
          <ion-icon name={open ? 'chevron-down-outline' : 'chevron-up-outline'} aria-hidden="true" />
        </button>

        {open && (
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--divider)' }}>
            {loadingList ? (
              <p className="text-sm text-[var(--text-muted)]">Loading saved revisions...</p>
            ) : error && !selectedId ? (
              <p role="alert" className="text-sm text-[var(--text-muted)]">{error}</p>
            ) : versions.length < 2 ? (
              <p className="text-sm text-[var(--text-muted)]">There are not enough saved revisions yet.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {isHistorical ? 'Previewing saved version' : `${editCount} saved ${editCount === 1 ? 'edit' : 'edits'}`}
                  </p>
                  <p className="text-xs tabular-nums text-[var(--text-muted)]">
                    {selectedVersion ? formatRevisionDate(selectedVersion.created_at) : ''}
                  </p>
                </div>
                <label htmlFor={`revision-range-${blogId}`} className="sr-only">Choose a saved revision</label>
                <input
                  id={`revision-range-${blogId}`}
                  type="range"
                  min="0"
                  max={versions.length - 1}
                  step="1"
                  value={selectedIndex}
                  onChange={event => {
                    const index = Number(event.currentTarget.value);
                    setRevisionParam(index < versions.length - 1 ? versions[index].id : null);
                  }}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="mb-4 flex justify-between text-[11px] text-[var(--text-faint)]">
                  <span>Oldest saved</span>
                  <span>{spanDays ? `${spanDays} ${spanDays === 1 ? 'day' : 'days'}` : ''}</span>
                  <span>Current</span>
                </div>
                {loadingRevision && isHistorical ? (
                  <p className="text-xs text-[var(--text-muted)]">Updating the story preview...</p>
                ) : error ? (
                  <p role="alert" className="text-xs text-[var(--text-muted)]">{error}</p>
                ) : isHistorical ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--accent-subtle)] px-3 py-2.5 text-xs">
                    <span className="text-[var(--text-muted)]">The complete story now shows this revision.</span>
                    <button type="button" onClick={() => setRevisionParam(null)} className="shrink-0 font-semibold text-[var(--accent)] hover:underline">
                      Latest
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </section>
      {historical && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-primary)' }}>
          <ion-icon name="time-outline" aria-hidden="true" />
          <span className="font-semibold">Historical preview</span>
          <span className="text-[var(--text-muted)]">Revision <code>{historical.id.slice(0, 7)}</code> from {formatRevisionDate(historical.created_at)}</span>
          <button type="button" onClick={() => setRevisionParam(null)} className="font-medium text-[var(--accent)] underline">
            Return to latest
          </button>
        </div>
      )}
    </>
  );
}
