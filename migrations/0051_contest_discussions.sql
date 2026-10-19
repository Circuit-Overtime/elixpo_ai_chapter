-- Contest-scoped public discussion. Posts remain attached to the contest rather
-- than to a submitted blog and are soft-deleted for moderation history.
CREATE TABLE IF NOT EXISTS contest_discussion_posts (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_contest_discussion_posts
  ON contest_discussion_posts(contest_id, deleted_at, created_at DESC);
