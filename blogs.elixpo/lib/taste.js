/**
 * User taste signal collection.
 * Records implicit interest signals from user behavior.
 * These feed into the personalization algorithm.
 *
 * Signal weights:
 *   read     = 1.0 (viewed a blog)
 *   dwell    = seconds/60 (time spent reading, capped at 5)
 *   like     = 2.0
 *   clap     = 1.5
 *   comment  = 3.0
 *   bookmark = 2.5
 *   search   = 0.5
 */

const SIGNAL_WEIGHTS = {
  read: 1.0,
  like: 2.0,
  clap: 1.5,
  comment: 3.0,
  bookmark: 2.5,
  search: 0.5,
  dwell: 1.0, // base, actual weight = min(seconds/60, 5)
};

/**
 * Record a taste signal for a user.
 * Automatically resolves blog tags and records one signal per tag.
 *
 * @param {D1Database} db
 * @param {string} userId
 * @param {string} signalType - read|like|clap|comment|bookmark|search|dwell
 * @param {object} opts
 * @param {string} [opts.blogId] - blog that triggered the signal
 * @param {string} [opts.tag] - explicit tag (for search signals)
 * @param {number} [opts.dwellSeconds] - time spent (for dwell signals)
 */
export async function recordSignal(db, userId, signalType, opts = {}) {
  if (!userId) return;

  try {
    const secs = Number(opts.dwellSeconds);
    if (signalType === 'dwell' && !Number.isFinite(secs)) return;
    const weight = signalType === 'dwell'
      ? Math.min(Math.max(secs, 0) / 60, 5)
      : SIGNAL_WEIGHTS[signalType] || 1.0;

    if (!Number.isFinite(weight) || weight <= 0) return;

    // If blog provided, get its tags and record one signal per tag
    if (opts.blogId) {
      const tags = await db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ?').bind(opts.blogId).all();
      const tagList = (tags?.results || []).map(t => t.tag);

      if (tagList.length > 0) {
        const placeholders = tagList.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const binds = tagList.flatMap(tag => [userId, signalType, tag, opts.blogId || null, weight]);
        await db.prepare(
          `INSERT INTO user_signals (user_id, signal_type, tag, blog_id, weight) VALUES ${placeholders}`
        ).bind(...binds).run();
        return;
      }
    }

    // Single signal (no tags or explicit tag)
    await db.prepare(
      'INSERT INTO user_signals (user_id, signal_type, tag, blog_id, weight) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, signalType, opts.tag || null, opts.blogId || null, weight).run();
  } catch (e) {
    console.error('Signal recording failed:', e?.message);
  }
}

/**
 * Get a user's top interest tags based on accumulated signals.
 * Returns tags ranked by total weighted score, decayed by recency.
 *
 * @param {D1Database} db
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Promise<Array<{tag: string, score: number}>>}
 */
export async function getUserTasteProfile(db, userId, limit = 20) {
  if (!userId) return [];

  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    // Score = sum of weights, with time decay (recent signals weigh more)
    const result = await db.prepare(`
      SELECT tag,
        SUM(weight * (1.0 - (? - created_at) * 1.0 / (30 * 86400))) as score
      FROM user_signals
      WHERE user_id = ? AND tag IS NOT NULL AND created_at > ?
      GROUP BY tag
      HAVING score > 0
      ORDER BY score DESC
      LIMIT ?
    `).bind(now, userId, thirtyDaysAgo, limit).all();

    return result?.results || [];
  } catch {
    return [];
  }
}

/**
 * Record a search query for history/suggestions.
 */
export async function recordSearch(db, userId, query, resultCount = 0) {
  if (!userId || !query?.trim()) return;
  try {
    await db.prepare(
      'INSERT INTO search_history (user_id, query, result_count) VALUES (?, ?, ?)'
    ).bind(userId, query.trim().toLowerCase(), resultCount).run();
  } catch {}
}

/**
 * Get search suggestions for a user (recent searches + popular queries).
 */
export async function getSearchSuggestions(db, userId, prefix = '', limit = 8) {
  try {
    const results = [];
    const escapeLike = (value) => String(value || '').toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`);
    const likePrefix = `${escapeLike(prefix)}%`;

    // User's recent unique searches
    if (userId) {
      const recent = await db.prepare(`
        SELECT query, MAX(created_at) as last_used FROM search_history
        WHERE user_id = ? AND query LIKE ? ESCAPE '\\'
        GROUP BY query ORDER BY last_used DESC LIMIT ?
      `).bind(userId, likePrefix, limit).all();
      for (const r of (recent?.results || [])) {
        results.push({ query: r.query, type: 'recent' });
      }
    }

    // Popular tags matching prefix
    if (results.length < limit) {
      const remaining = limit - results.length;
      const popular = await db.prepare(`
        SELECT tag, COUNT(*) as cnt FROM blog_tags
        WHERE LOWER(tag) LIKE ? ESCAPE '\\'
        GROUP BY tag ORDER BY cnt DESC LIMIT ?
      `).bind(likePrefix, remaining).all();
      const existing = new Set(results.map(r => r.query));
      for (const t of (popular?.results || [])) {
        if (!existing.has(t.tag)) results.push({ query: t.tag, type: 'topic' });
      }
    }

    return results;
  } catch {
    return [];
  }
}
