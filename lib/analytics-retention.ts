import { getDB } from './db';

/** Delete raw click events outside the account's advertised access window. */
export async function pruneUserClicks(userId: number, retentionDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  await getDB().prepare(
    `DELETE FROM clicks
     WHERE clicked_at < ? AND url_id IN (SELECT id FROM urls WHERE user_id = ?)`,
  ).bind(cutoff, userId).run();
}
