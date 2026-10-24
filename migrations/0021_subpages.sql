-- Sub-pages: single-level child pages within a blog
CREATE TABLE IF NOT EXISTS subpages (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL,          -- parent blog slugid
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT,                   -- JSON block format (same as blogs)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subpages_blog ON subpages(blog_id);
