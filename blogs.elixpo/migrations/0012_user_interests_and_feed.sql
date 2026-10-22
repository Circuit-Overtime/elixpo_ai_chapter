-- User topic interests (influences feed)
CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_user_interests_tag ON user_interests(tag);

-- Composite index for feed queries (status + published_at)
CREATE INDEX IF NOT EXISTS idx_blogs_status_published ON blogs(status, published_at);
