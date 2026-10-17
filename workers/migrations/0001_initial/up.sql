-- =============================================================================
-- Elixpo Art — Initial Schema
-- Migration: 0001_initial
-- =============================================================================

-- Pricing plans available on the platform
CREATE TABLE IF NOT EXISTS plans (
  id                TEXT PRIMARY KEY,            -- 'free', 'atelier', 'masterpiece'
  name              TEXT NOT NULL,
  price_monthly     REAL NOT NULL DEFAULT 0,
  price_yearly      REAL NOT NULL DEFAULT 0,
  daily_images      INTEGER NOT NULL DEFAULT 50,
  daily_video_mins  REAL NOT NULL DEFAULT 0,     -- minutes of video per day
  max_resolution    TEXT NOT NULL DEFAULT '1024x1024',
  priority_queue    INTEGER NOT NULL DEFAULT 0,  -- 1 = priority
  features          TEXT NOT NULL DEFAULT '[]',  -- JSON array of feature strings
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,              -- from SSO / oauth sub
  email                 TEXT NOT NULL UNIQUE,
  display_name          TEXT,
  avatar_url            TEXT,
  plan_id               TEXT NOT NULL DEFAULT 'free',
  images_used_today     INTEGER NOT NULL DEFAULT 0,
  video_mins_used_today REAL NOT NULL DEFAULT 0,
  usage_reset_at        TEXT NOT NULL DEFAULT (datetime('now')),
  stripe_customer_id    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Generated images / videos
CREATE TABLE IF NOT EXISTS creations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'image',     -- 'image' or 'video'
  prompt          TEXT NOT NULL,
  negative_prompt TEXT,
  model           TEXT,
  width           INTEGER,
  height          INTEGER,
  steps           INTEGER,
  seed            INTEGER,
  url             TEXT,                               -- CDN / R2 link
  thumbnail_url   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',    -- pending, generating, completed, failed
  duration        REAL,                               -- video duration in seconds
  credits_used    INTEGER NOT NULL DEFAULT 1,
  metadata        TEXT,                                -- extra JSON (cfg_scale, sampler, etc.)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Credit transactions for audit trail
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL,                   -- positive = grant, negative = spend
  type        TEXT NOT NULL DEFAULT 'image',       -- 'image' or 'video'
  reason      TEXT NOT NULL,                       -- 'daily_reset', 'generation', 'bonus', 'purchase'
  creation_id TEXT,                                -- links to creation if spent on generation
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (creation_id) REFERENCES creations(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan_id);
CREATE INDEX IF NOT EXISTS idx_creations_user ON creations(user_id);
CREATE INDEX IF NOT EXISTS idx_creations_status ON creations(status);
CREATE INDEX IF NOT EXISTS idx_creations_created ON creations(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);

-- Seed pricing plans
-- Guest (unauthenticated): 10 images, 2 videos — enforced in app code, not in DB
--
-- Rate limits per plan:
--   Free:        50 images/day, 2 min video/day
--   Atelier:    200 images/day, 5 min video/day   ($12/mo, $120/yr)
--   Masterpiece: 500 images/day, 15 min video/day  ($49/mo, $490/yr)

INSERT OR IGNORE INTO plans (id, name, price_monthly, price_yearly, daily_images, daily_video_mins, max_resolution, priority_queue, features) VALUES
  ('free', 'Free', 0, 0, 50, 2, '1024x1024', 0, '["50 images/day","2 min video/day","Standard models","1024x1024 max","Community support"]'),
  ('atelier', 'Atelier', 12, 120, 200, 5, '2048x2048', 1, '["200 images/day","5 min video/day","All models","2048x2048 max","Priority queue","Early access to new models","Private creations"]'),
  ('masterpiece', 'Masterpiece', 49, 490, 500, 15, '4096x4096', 1, '["500 images/day","15 min video/day","All models","4096x4096 max","Priority queue","API access","Dedicated support","Custom model fine-tuning"]');
