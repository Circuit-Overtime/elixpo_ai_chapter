ALTER TABLE clicks ADD COLUMN visitor_hash TEXT;
ALTER TABLE clicks ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0 CHECK(is_bot IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_clicks_url_bot_time
  ON clicks(url_id, is_bot, clicked_at);
CREATE INDEX IF NOT EXISTS idx_clicks_url_visitor
  ON clicks(url_id, visitor_hash);
