-- AI usage tracking for daily quota enforcement
CREATE TABLE IF NOT EXISTS ai_usage (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  guest_id    TEXT,
  used_at     TEXT DEFAULT (datetime('now')),
  mode        TEXT DEFAULT 'lixscript'
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, used_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_guest_date ON ai_usage(guest_id, used_at);

-- Add tier column to users table
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free';
