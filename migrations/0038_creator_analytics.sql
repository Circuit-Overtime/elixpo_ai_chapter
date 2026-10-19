-- Privacy-safe, append-only creator analytics. Existing blog_views and
-- interaction tables remain the historical aggregate source of truth.
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'impression', 'view', 'read_progress', 'read_complete', 'share'
  )),
  event_value REAL,
  referrer_source TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_category TEXT,
  country_code TEXT,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  dedupe_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_blog_time
  ON analytics_events(blog_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_blog_type_time
  ON analytics_events(blog_id, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_time
  ON analytics_events(visitor_hash, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON analytics_events(user_id, occurred_at);

-- Follow rows disappear on unfollow, so retain a compact change ledger for
-- gained/lost/net follower reporting without keeping reader profile data.
CREATE TABLE IF NOT EXISTS creator_follow_events (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'org')),
  target_id TEXT NOT NULL,
  follower_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL CHECK(delta IN (-1, 1)),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_creator_follow_events_target_time
  ON creator_follow_events(target_type, target_id, occurred_at);

INSERT INTO creator_follow_events (id, target_type, target_id, follower_id, delta, occurred_at)
SELECT 'backfill:' || following_type || ':' || following_id || ':' || follower_id,
  following_type, following_id, follower_id, 1, created_at
FROM follows;
