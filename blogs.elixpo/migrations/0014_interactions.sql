-- Claps (Medium-style, 1-50 per user per blog)
CREATE TABLE IF NOT EXISTS claps (
  user_id TEXT NOT NULL REFERENCES users(id),
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, blog_id)
);
CREATE INDEX IF NOT EXISTS idx_claps_blog ON claps(blog_id);

-- Bookmark collections (named library folders)
CREATE TABLE IF NOT EXISTS bookmark_collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, name)
);

-- Add collection_id FK to bookmarks
ALTER TABLE bookmarks ADD COLUMN collection_id TEXT REFERENCES bookmark_collections(id) ON DELETE SET NULL;

-- Performance indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_read_history_read_at ON read_history(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_blog_views_dedup ON blog_views(blog_id, ip_hash, created_at);
