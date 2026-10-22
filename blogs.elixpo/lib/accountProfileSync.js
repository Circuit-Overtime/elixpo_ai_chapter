// Synchronize identity fields owned by accounts.elixpo into the local user row.
// Blog URLs do not store a copy of the username: every canonical URL joins the
// blog's author_id to users.username, so changing this one row updates every
// personal post URL immediately.

const ACCOUNT_USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|[-_](?![-_])){1,30}[a-z0-9]$/;

export function normalizeAccountUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  return ACCOUNT_USERNAME_RE.test(username) ? username : '';
}

export async function syncAccountProfile(db, profile) {
  const userId = String(profile?.userId || '');
  if (!userId) throw new Error('Missing account user id');

  const current = await db.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!current) return { found: false, usernameChanged: false };

  const nextUsername = profile.username === undefined
    ? current.username
    : normalizeAccountUsername(profile.username);
  if (!nextUsername) throw new Error('Invalid account username');

  const usernameChanged = nextUsername !== current.username;
  let namespaceCollision = null;
  if (usernameChanged) {
    const collisionRows = await Promise.all([
      db.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?')
        .bind(nextUsername, userId).first(),
      db.prepare('SELECT owner_type, owner_id FROM namespaces WHERE name = ?')
        .bind(nextUsername).first(),
    ]);
    const [userCollision] = collisionRows;
    namespaceCollision = collisionRows[1];
    if (userCollision || (namespaceCollision && namespaceCollision.owner_id !== userId)) {
      throw new Error('Account username conflicts with an existing LixBlogs namespace');
    }
  }

  const updates = ['username = ?', 'updated_at = ?'];
  const values = [nextUsername, Math.floor(Date.now() / 1000)];
  const optional = [
    ['email', profile.email],
    ['display_name', profile.displayName],
    ['avatar_url', profile.avatarUrl],
  ];
  for (const [column, value] of optional) {
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      values.push(value);
    }
  }

  const statements = [];
  if (usernameChanged) {
    statements.push(
      db.prepare("DELETE FROM namespaces WHERE name = ? AND owner_type = 'user' AND owner_id = ?")
        .bind(current.username, userId),
    );
    if (!namespaceCollision) {
      statements.push(db.prepare(`
        INSERT INTO namespaces (name, owner_type, owner_id, created_at)
        VALUES (?, 'user', ?, unixepoch())
      `).bind(nextUsername, userId));
    }
  }
  statements.push(
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values, userId),
  );
  await db.batch(statements);

  // Aliases preserve old profile/post links. Keep this best-effort so applying
  // the application before migration 0039 cannot block identity sync.
  if (usernameChanged) {
    try {
      await db.batch([
        db.prepare('DELETE FROM username_aliases WHERE username = ?').bind(nextUsername),
        db.prepare(`
          INSERT OR IGNORE INTO username_aliases (username, user_id, created_at)
          VALUES (?, ?, unixepoch())
        `).bind(current.username, userId),
      ]);
    } catch (error) {
      console.warn('[account-sync] Username alias was not recorded:', error?.message || error);
    }
  }

  try {
    const { kvInvalidate, PUBLIC_SITEMAP_CACHE_KEY } = await import('./cache');
    await kvInvalidate(
      `v1:user:${userId}`,
      ...(usernameChanged ? [PUBLIC_SITEMAP_CACHE_KEY] : []),
    );
  } catch {}

  return { found: true, usernameChanged, previousUsername: current.username, username: nextUsername };
}
