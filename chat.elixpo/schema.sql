-- Conversations
CREATE TABLE conversations (
  id           TEXT PRIMARY KEY,                    -- nanoid()
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT 'New Chat',
  model        TEXT NOT NULL DEFAULT 'gpt-4o',
  system_prompt TEXT,
  created_at   INTEGER NOT NULL,                    -- Unix ms
  updated_at   INTEGER NOT NULL,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  is_shared    INTEGER NOT NULL DEFAULT 0,
  share_slug   TEXT UNIQUE,
  metadata     TEXT                                 -- JSON blob
);
CREATE INDEX idx_conv_user ON conversations(user_id, updated_at DESC);

-- Messages
CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content          TEXT NOT NULL,
  model            TEXT,
  attachments      TEXT,                            -- JSON array of R2 URLs
  tool_calls       TEXT,                            -- JSON
  tool_call_id     TEXT,
  usage_tokens     INTEGER,
  latency_ms       INTEGER,
  rating           INTEGER CHECK(rating IN (-1,0,1)),
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at ASC);
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid);

-- Users (mirror of accounts.elixpo — kept in sync via OAuth token)
CREATE TABLE users (
  id           TEXT PRIMARY KEY,                    -- from accounts.elixpo user_id
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  plan         TEXT NOT NULL DEFAULT 'free',
  preferences  TEXT,                                -- JSON (model, theme, etc.)
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);

-- Pinned chats, folders (future)
CREATE TABLE conversation_pins (
  user_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pinned_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);

-- Image generations
CREATE TABLE image_generations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  r2_url      TEXT NOT NULL,
  model       TEXT,
  params      TEXT,                                 -- JSON (size, style, seed)
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_img_user ON image_generations(user_id, created_at DESC);
