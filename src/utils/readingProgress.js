const STORAGE_KEY = 'lixblogs:recent-reading:v1';
const MAX_RECENT_STORIES = 5;

function scopedKey(readerKey) {
  return `${STORAGE_KEY}:${readerKey || 'guest'}`;
}

export function recentReading(readerKey = 'guest') {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(readerKey)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_STORIES) : [];
  } catch {
    return [];
  }
}

export function readingProgressFor(blogId, readerKey = 'guest') {
  return recentReading(readerKey).find(item => item.blogId === blogId) || null;
}

export function rememberReadingProgress({ blogId, title, url, progress, readerKey = 'guest' }) {
  if (typeof window === 'undefined' || !blogId) return;
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  const remaining = recentReading(readerKey).filter(item => item.blogId !== blogId);
  const next = normalized >= 0.9 || normalized < 0.02
    ? remaining
    : [{ blogId, title: title || 'Untitled story', url: url || window.location.pathname, progress: normalized, updatedAt: Date.now() }, ...remaining].slice(0, MAX_RECENT_STORIES);
  try {
    localStorage.setItem(scopedKey(readerKey), JSON.stringify(next));
  } catch {}
}

export function clearReadingProgress(blogId, readerKey = 'guest') {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(scopedKey(readerKey), JSON.stringify(recentReading(readerKey).filter(item => item.blogId !== blogId)));
  } catch {}
}
