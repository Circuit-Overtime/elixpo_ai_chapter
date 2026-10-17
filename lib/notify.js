/**
 * Server-side notification helper.
 * Call from any API route to create an in-app notification.
 *
 * Usage:
 *   import { notify } from '../../../lib/notify';
 *   await notify(db, {
 *     userId: 'recipient-id',
 *     type: 'follow',
 *     actorId: 'who-did-it',
 *     actorName: 'username',
 *     actorAvatar: 'https://...',
 *     targetId: null,
 *     targetTitle: null,
 *     targetUrl: '/username',
 *   });
 */

/**
 * @param {D1Database} db
 * @param {object} opts
 * @param {string} opts.userId        - Who receives the notification
 * @param {string} opts.type          - follow | comment | like | mention | org_invite | blog_invite | blog_published | badge_awarded
 * @param {string} [opts.actorId]     - Who triggered it
 * @param {string} [opts.actorName]   - Display name of actor
 * @param {string} [opts.actorAvatar] - Avatar URL of actor
 * @param {string} [opts.targetId]    - Blog/org/comment ID
 * @param {string} [opts.targetTitle] - Blog title, org name, etc.
 * @param {string} [opts.targetUrl]   - URL to navigate to
 * @param {boolean} [opts.dedupe]     - Create at most one notification per user/type/target
 */

  const PREF_MAP = {
    follow: 'follow_enabled',
    comment: 'comment_enabled',
    like: 'like_enabled',
    mention: 'mention_enabled',
    org_invite: 'org_invite_enabled',
    blog_invite: 'blog_invite_enabled',
    blog_published: 'blog_published_enabled',
  };


export async function notify(db, opts) {
  // Don't notify yourself
  if (opts.actorId && opts.actorId === opts.userId) return;

  try {
// prefKey comes from the hardcoded PREF_MAP above
// and is never user-controlled.
    const prefKey = PREF_MAP[opts.type];
    if (prefKey) {
      const prefs = await db.prepare(`
        SELECT ${prefKey}
        FROM notification_prefs
        WHERE user_id = ?
      `)
        .bind(opts.userId)
        .first();

      if (prefs && prefs[prefKey] === 0) {
        return;
      }
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const values = [
      id, opts.userId, opts.type, opts.actorId || null,
      opts.actorName || null, opts.actorAvatar || null,
      opts.targetId || null, opts.targetTitle || null,
      opts.targetUrl || null, now,
    ];

    if (opts.dedupe && opts.targetId) {
      await db.prepare(`
        INSERT INTO notifications (
          id, user_id, type, actor_id, actor_name, actor_avatar,
          target_id, target_title, target_url, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = ? AND type = ? AND target_id = ?
        )
      `).bind(
        ...values,
        opts.userId,
        opts.type,
        opts.targetId,
      ).run();
      return;
    }

    await db.prepare(`
      INSERT INTO notifications (
        id, user_id, type, actor_id, actor_name, actor_avatar,
        target_id, target_title, target_url, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...values).run();
  } catch (e) {
    console.error('Failed to create notification:', e?.message || e);
  }
}
/**
 * Notify multiple users at once (e.g. all org members, all followers).
 */
export async function notifyMany(db, userIds, opts) {
  const filtered = userIds.filter(id => id !== opts.actorId);
  await Promise.all(filtered.map(userId => notify(db, { ...opts, userId })));
}
