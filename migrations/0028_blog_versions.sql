-- Version history for blogs (#11 E). One row per saved snapshot; content is
-- stored the same way as blogs.content (compressed JSON blocks). Throttled on
-- draft save (≤ 1 / 5 min) and on every publish; trimmed to the latest N.
CREATE TABLE IF NOT EXISTS blog_versions (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL,
  content TEXT,
  label TEXT,                 -- e.g. 'published' | 'autosave'
  created_by TEXT,            -- user id who triggered the snapshot
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_blog_versions_blog ON blog_versions(blog_id, created_at DESC);
