-- Creator achievements. Definitions and qualification rules live in
-- lib/creatorBadges.js; the database stores awards and creator-controlled display.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  awarded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  visible INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  pinned_position INTEGER CHECK (pinned_position BETWEEN 1 AND 3),
  source TEXT NOT NULL DEFAULT 'automatic' CHECK (source IN ('automatic', 'manual')),
  progress_value REAL NOT NULL DEFAULT 0,
  progress_target REAL NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_public
  ON user_badges(user_id, visible, pinned_position, awarded_at);

CREATE TABLE IF NOT EXISTS badge_award_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('awarded', 'shown', 'hidden', 'pinned', 'unpinned', 'revoked')),
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_badge_award_events_user
  ON badge_award_events(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_award_once
  ON badge_award_events(user_id, badge_id, event_type)
  WHERE event_type = 'awarded';
