-- Reposts: a user re-shares a blog to their followers/profile. A user can't
-- repost a blog they authored or co-author.
CREATE TABLE IF NOT EXISTS reposts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, blog_id)
);

CREATE INDEX IF NOT EXISTS idx_reposts_blog ON reposts(blog_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user ON reposts(user_id);
