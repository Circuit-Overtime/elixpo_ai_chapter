CREATE TABLE IF NOT EXISTS image_assets (
  public_id   TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_image_assets_session ON image_assets(session_id, status);
