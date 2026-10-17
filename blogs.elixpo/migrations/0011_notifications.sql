-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- 'follow' | 'comment' | 'like' | 'mention' | 'org_invite' | 'blog_invite' | 'blog_published'
  actor_id TEXT REFERENCES users(id),
  actor_name TEXT,
  actor_avatar TEXT,
  target_id TEXT,                    -- blog_id, org_id, or comment_id depending on type
  target_title TEXT,                 -- blog title, org name, etc.
  target_url TEXT,                   -- link to navigate to
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read);
