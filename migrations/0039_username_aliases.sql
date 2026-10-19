-- Preserve public profile and personal-blog links after an Accounts username
-- change. The resolver redirects an alias to the user's current username.
CREATE TABLE IF NOT EXISTS username_aliases (
  username TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_username_aliases_user
  ON username_aliases(user_id);

-- Delivery deduplication for retried app-scoped Accounts webhooks.
CREATE TABLE IF NOT EXISTS account_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_account_webhook_events_created
  ON account_webhook_events(created_at);

-- One-time repair for the account that exposed the propagation bug. Every
-- predicate is ownership/collision guarded, so this is safe to re-run and
-- becomes a no-op if the webhook/login reconciliation already fixed the row.
UPDATE users
SET username = 'anweshachakraborty', updated_at = unixepoch()
WHERE username = 'anweshachakraborty36gmailcom'
  AND NOT EXISTS (
    SELECT 1 FROM users AS collision
    WHERE LOWER(collision.username) = 'anweshachakraborty'
      AND collision.id != users.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM namespaces AS collision
    WHERE collision.name = 'anweshachakraborty'
      AND collision.owner_id != users.id
  );

INSERT OR IGNORE INTO username_aliases (username, user_id, created_at)
SELECT 'anweshachakraborty36gmailcom', u.id, unixepoch()
FROM users AS u
JOIN namespaces AS old_namespace
  ON old_namespace.name = 'anweshachakraborty36gmailcom'
  AND old_namespace.owner_type = 'user'
  AND old_namespace.owner_id = u.id
WHERE u.username = 'anweshachakraborty';

DELETE FROM namespaces
WHERE name = 'anweshachakraborty36gmailcom'
  AND owner_type = 'user'
  AND owner_id = (
    SELECT user_id FROM username_aliases
    WHERE username = 'anweshachakraborty36gmailcom'
  );

INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id, created_at)
SELECT 'anweshachakraborty', 'user', user_id, unixepoch()
FROM username_aliases
WHERE username = 'anweshachakraborty36gmailcom';
