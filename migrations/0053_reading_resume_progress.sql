-- Keep the reader's latest position separate from their furthest analytics
-- milestone. Completing a story clears its resumable position without losing
-- completion data used by creator analytics.
ALTER TABLE read_history ADD COLUMN resume_progress REAL NOT NULL DEFAULT 0
  CHECK (resume_progress >= 0 AND resume_progress <= 1);

