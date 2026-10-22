-- Per-user mutes for the feed "..." menu: hide an author, an org/publication,
-- or a topic/tag. target_type = 'author' | 'org' | 'tag'.
CREATE TABLE IF NOT EXISTS mutes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_mutes_user ON mutes(user_id);
