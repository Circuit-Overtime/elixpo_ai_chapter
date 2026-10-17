-- Chat schema: conversations, messages, users, pins, image generations
-- Migrated from schema.sql to wrangler D1 migration format

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT 'New Chat',
  model        TEXT NOT NULL DEFAULT 'gpt-4o',
  system_prompt TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  is_shared    INTEGER NOT NULL DEFAULT 0,
  share_slug   TEXT UNIQUE,
  metadata     TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content          TEXT NOT NULL,
  model            TEXT,
  attachments      TEXT,
  tool_calls       TEXT,
  tool_call_id     TEXT,
  usage_tokens     INTEGER,
  latency_ms       INTEGER,
  rating           INTEGER CHECK(rating IN (-1,0,1)),
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at ASC);

-- Users (mirror of accounts.elixpo)
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  plan         TEXT NOT NULL DEFAULT 'free',
  preferences  TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);

-- Pinned chats
CREATE TABLE IF NOT EXISTS conversation_pins (
  user_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pinned_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);

-- Image generations
CREATE TABLE IF NOT EXISTS image_generations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  r2_url      TEXT NOT NULL,
  model       TEXT,
  params      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_img_user ON image_generations(user_id, created_at DESC);
