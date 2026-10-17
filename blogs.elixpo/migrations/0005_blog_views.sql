-- Track individual blog views for stats
CREATE TABLE IF NOT EXISTS blog_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_blog_views_blog ON blog_views(blog_id);
CREATE INDEX IF NOT EXISTS idx_blog_views_created ON blog_views(created_at);
CREATE INDEX IF NOT EXISTS idx_blog_views_user ON blog_views(user_id);
