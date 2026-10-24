CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  follow_enabled INTEGER NOT NULL DEFAULT 1,
  comment_enabled INTEGER NOT NULL DEFAULT 1,
  like_enabled INTEGER NOT NULL DEFAULT 1,
  mention_enabled INTEGER NOT NULL DEFAULT 1,

  org_invite_enabled INTEGER NOT NULL DEFAULT 1,
  blog_invite_enabled INTEGER NOT NULL DEFAULT 1,
  blog_published_enabled INTEGER NOT NULL DEFAULT 1,

  email_enabled INTEGER NOT NULL DEFAULT 1,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
ON notification_prefs(user_id);
