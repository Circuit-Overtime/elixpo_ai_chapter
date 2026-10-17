-- User taste signals — tracks implicit interest from behavior
-- Used by the feed algorithm to personalize content
CREATE TABLE IF NOT EXISTS user_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,        -- 'read' | 'like' | 'clap' | 'comment' | 'bookmark' | 'search' | 'dwell'
  tag TEXT,                          -- blog tag associated with the signal
  blog_id TEXT,                      -- blog that triggered the signal
  weight REAL NOT NULL DEFAULT 1.0,  -- signal strength (dwell time = seconds/60, like = 2, comment = 3, etc.)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_user_signals_user ON user_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_signals_tag ON user_signals(user_id, tag);

-- Search history for suggestions
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at DESC);
