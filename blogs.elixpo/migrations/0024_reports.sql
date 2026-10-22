-- Blog moderation reports.
-- One open report per (blog, reporter) — dedup via the unique index.
-- gh_issue_number links all reports for a blog to a single moderation issue.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES users(id),
  reason TEXT NOT NULL,                 -- spam | harassment | nsfw | copyright | misinfo | other
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open | actioned | dismissed
  gh_issue_number INTEGER,              -- moderation issue tracking this blog
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_reports_blog ON reports(blog_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique ON reports(blog_id, reporter_id);
