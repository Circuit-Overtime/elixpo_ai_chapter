import { getDB } from './db';
import type { GuestRiskIdentity } from './guest-risk';

export const FREE_DAILY_CREATION_LIMIT = 2;

function utcWindow(now = new Date()): { start: string; resetAt: string } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const reset = new Date(start);
  reset.setUTCDate(reset.getUTCDate() + 1);
  return { start: start.toISOString(), resetAt: reset.toISOString() };
}

export interface CreationQuotaClaim {
  allowed: boolean;
  used: number;
  resetAt: string;
  windowStart: string;
}

/** Atomically claim one of a free account's two UTC-day creations. */
export async function claimFreeCreation(
  userId: number,
  risk?: GuestRiskIdentity,
): Promise<CreationQuotaClaim> {
  const { start, resetAt } = utcWindow();
  const row = await getDB()
    .prepare(
      `INSERT INTO user_creation_quotas
         (user_id, window_start, created_count, last_fingerprint_hash, last_risk_score, updated_at)
       VALUES (?, ?, 1, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         window_start = excluded.window_start,
         created_count = CASE
           WHEN user_creation_quotas.window_start = excluded.window_start
             THEN user_creation_quotas.created_count + 1
           ELSE 1
         END,
         last_fingerprint_hash = excluded.last_fingerprint_hash,
         last_risk_score = excluded.last_risk_score,
         updated_at = datetime('now')
       WHERE user_creation_quotas.window_start <> excluded.window_start
          OR user_creation_quotas.created_count < ?
       RETURNING created_count`,
    )
    .bind(
      userId,
      start,
      risk?.fingerprintHash ?? null,
      risk?.score ?? 0,
      FREE_DAILY_CREATION_LIMIT,
    )
    .first<{ created_count: number }>();

  return {
    allowed: !!row,
    used: row?.created_count ?? FREE_DAILY_CREATION_LIMIT,
    resetAt,
    windowStart: start,
  };
}

/** Return a claimed slot when the link insert itself fails. */
export async function releaseFreeCreation(
  userId: number,
  windowStart: string,
): Promise<void> {
  await getDB()
    .prepare(
      `UPDATE user_creation_quotas
       SET created_count = MAX(created_count - 1, 0), updated_at = datetime('now')
       WHERE user_id = ? AND window_start = ?`,
    )
    .bind(userId, windowStart)
    .run();
}

export function currentUtcQuotaWindow(): { start: string; resetAt: string } {
  return utcWindow();
}
