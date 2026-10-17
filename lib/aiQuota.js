// Atomic daily AI quota accounting.
//
// The counter lives on `users` (ai_usage_today + ai_usage_date, UTC day). The
// previous implementation read the counter, compared it in JavaScript, then
// wrote `usage + 1` back. Requests are served by independent edge isolates, so
// N parallel requests could all read the same value, all pass the check and all
// write the same incremented value: the daily cap was bypassed and the counter
// under-reported real usage.
//
// Here the check and the increment are ONE conditional UPDATE. SQLite/D1
// executes a single statement atomically, so exactly `limit` claims can ever
// succeed per user per day, however many requests race.

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Try to consume one AI request from the user's daily allowance.
 *
 * @param {D1Database} db
 * @param {string} userId
 * @param {number} limit   requests allowed per UTC day for the user's tier
 * @param {string} [today] UTC day (YYYY-MM-DD); injectable for tests
 * @returns {Promise<boolean>} true when a request was claimed, false when the
 *   allowance is exhausted (or the user row does not exist)
 */
export async function claimAIQuota(db, userId, limit, today = utcDay()) {
  const result = await db.prepare(`
    UPDATE users
    SET ai_usage_today = CASE WHEN ai_usage_date = ? THEN COALESCE(ai_usage_today, 0) + 1 ELSE 1 END,
        ai_usage_date = ?
    WHERE id = ?
      AND (CASE WHEN ai_usage_date = ? THEN COALESCE(ai_usage_today, 0) ELSE 0 END) < ?
  `).bind(today, today, userId, today, limit).run();
  return (result?.meta?.changes ?? 0) > 0;
}
