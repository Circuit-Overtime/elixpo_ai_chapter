ALTER TABLE urls ADD COLUMN campaign TEXT;
ALTER TABLE urls ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_urls_user_campaign
  ON urls(user_id, campaign);
