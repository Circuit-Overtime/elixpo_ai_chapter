'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar/Navbar';
import { isSignedIn } from '../lib/auth';
import { getLibrary, removeFromLibrary } from '../lib/library';
import { useModels, modelLabel as getModelLabel } from '../lib/useModels';
import styles from './Creations.module.css';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CreationsPage() {
  const router = useRouter();
  const { all: allModels } = useModels();
  const modelLabel = (id) => getModelLabel(allModels, id);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all'); // all | image | video
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!isSignedIn()) {
      router.push('/');
      return;
    }
    setItems(getLibrary());
  }, [router]);

  const filtered = items.filter((i) => {
    if (filter === 'image') return i.mode !== 'video';
    if (filter === 'video') return i.mode === 'video';
    return true;
  });

  const handleDelete = (sessionId) => {
    const updated = removeFromLibrary(sessionId);
    setItems(updated);
    if (selected?.sessionId === sessionId) setSelected(null);
  };

  const handleOpen = (item) => {
    // Re-seed sessionStorage so the session page can load it
    sessionStorage.setItem(`gen_${item.sessionId}`, JSON.stringify({
      prompt: item.prompt,
      model: item.model,
      width: item.width,
      height: item.height,
      mode: item.mode,
      duration: item.duration,
      seed: item.seed,
      resultSrc: item.thumbnail, // Use thumbnail as fallback
      generationTime: item.generationTime,
      timestamp: item.createdAt,
    }));
    router.push(`/generate/${item.sessionId}`);
  };

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        {/* Background blobs */}
        <div className={styles.bgBlob1} aria-hidden="true" />
        <div className={styles.bgBlob2} aria-hidden="true" />

        <div className={styles.header}>
          <h1 className={styles.title}>Your Creations</h1>
          <p className={styles.subtitle}>{items.length} generation{items.length !== 1 ? 's' : ''} in your library</p>
        </div>

        {/* Filter tabs */}
        <div className={styles.filters}>
          {['all', 'image', 'video'].map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'image' ? 'Images' : 'Videos'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className={styles.emptyText}>
              {filter === 'all' ? 'No creations yet. Start generating!' : `No ${filter}s found.`}
            </p>
            <a href="/generate" className={styles.emptyBtn}>Create Something</a>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((item) => (
              <div
                key={item.sessionId}
                className={`${styles.card} ${selected?.sessionId === item.sessionId ? styles.cardSelected : ''}`}
                onClick={() => setSelected(selected?.sessionId === item.sessionId ? null : item)}
              >
                {/* Thumbnail */}
                <div className={styles.thumbWrap}>
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.prompt} className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbPlaceholder}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                  {item.mode === 'video' && (
                    <span className={styles.videoBadge}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className={styles.cardBody}>
                  <p className={styles.cardPrompt}>{item.prompt}</p>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardModel}>{modelLabel(item.model)}</span>
                    <span className={styles.cardRes}>{item.width}x{item.height}</span>
                    <span className={styles.cardTime}>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>

                {/* Hover actions */}
                <div className={styles.cardActions}>
                  <button className={styles.cardAction} onClick={(e) => { e.stopPropagation(); handleOpen(item); }} title="Open">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                  <button className={styles.cardAction} onClick={(e) => { e.stopPropagation(); handleDelete(item.sessionId); }} title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selected && (
          <div className={styles.detailOverlay} onClick={() => setSelected(null)}>
            <div className={styles.detail} onClick={(e) => e.stopPropagation()}>
              <button className={styles.detailClose} onClick={() => setSelected(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {selected.thumbnail && (
                <img src={selected.thumbnail} alt={selected.prompt} className={styles.detailImg} />
              )}

              <div className={styles.detailBody}>
                <h3 className={styles.detailTitle}>Prompt</h3>
                <p className={styles.detailPrompt}>{selected.prompt}</p>

                <div className={styles.detailGrid}>
                  <div className={styles.detailProp}>
                    <span className={styles.detailKey}>Model</span>
                    <span className={styles.detailVal}>{modelLabel(selected.model)}</span>
                  </div>
                  <div className={styles.detailProp}>
                    <span className={styles.detailKey}>Resolution</span>
                    <span className={styles.detailVal}>{selected.width}x{selected.height}</span>
                  </div>
                  <div className={styles.detailProp}>
                    <span className={styles.detailKey}>Seed</span>
                    <span className={styles.detailVal}>{selected.seed || '—'}</span>
                  </div>
                  <div className={styles.detailProp}>
                    <span className={styles.detailKey}>Mode</span>
                    <span className={styles.detailVal}>{selected.mode === 'video' ? 'Video' : 'Image'}</span>
                  </div>
                  {selected.generationTime && (
                    <div className={styles.detailProp}>
                      <span className={styles.detailKey}>Gen Time</span>
                      <span className={styles.detailVal}>{(selected.generationTime / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  <div className={styles.detailProp}>
                    <span className={styles.detailKey}>Created</span>
                    <span className={styles.detailVal}>{new Date(selected.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className={styles.detailActions}>
                  <button className={styles.detailBtn} onClick={() => handleOpen(selected)}>
                    Open in Studio
                  </button>
                  <button className={styles.detailBtnDanger} onClick={() => handleDelete(selected.sessionId)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
