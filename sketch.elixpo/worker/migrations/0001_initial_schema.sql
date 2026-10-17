-- LixSketch D1 Schema
-- Run: wrangler d1 execute lixsketch-db --file=./d1-schema.sql

-- Authenticated users (from Elixpo Accounts SSO)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  avatar          TEXT,
  provider        TEXT DEFAULT 'elixpo',
  ip_address      TEXT,
  user_agent      TEXT,
  locale          TEXT,
  country         TEXT,
  timezone        TEXT,
  login_count     INTEGER DEFAULT 1,
  last_login_at   TEXT DEFAULT (datetime('now')),
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Saved scenes for shareable links
CREATE TABLE IF NOT EXISTS scenes (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  workspace_name  TEXT DEFAULT 'Untitled',
  encrypted_data  TEXT NOT NULL,
  format_version  INTEGER DEFAULT 1,
  permission      TEXT DEFAULT 'view',
  created_by      TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  expires_at      TEXT,
  view_count      INTEGER DEFAULT 0,
  size_bytes      INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scenes_session ON scenes(session_id);
CREATE INDEX IF NOT EXISTS idx_scenes_creator ON scenes(created_by);

-- Collaboration room metadata
CREATE TABLE IF NOT EXISTS rooms (
  id              TEXT PRIMARY KEY,
  owner_user_id   TEXT,
  owner_ip        TEXT,
  workspace_name  TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL,
  closed_at       TEXT,
  max_users       INTEGER DEFAULT 10,
  status          TEXT DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_user_id);

-- Per-link permissions for shareable scenes
CREATE TABLE IF NOT EXISTS scene_permissions (
  id              TEXT PRIMARY KEY,
  scene_id        TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  permission      TEXT NOT NULL DEFAULT 'view',
  created_at      TEXT DEFAULT (datetime('now')),
  expires_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_perms_token ON scene_permissions(token);
CREATE INDEX IF NOT EXISTS idx_perms_scene ON scene_permissions(scene_id);
