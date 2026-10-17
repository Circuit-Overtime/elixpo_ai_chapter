CREATE TABLE IF NOT EXISTS pollinations_connections (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled                 INTEGER NOT NULL DEFAULT 1,
  access_token_encrypted  TEXT NOT NULL,
  token_expires_at        INTEGER NOT NULL,
  oauth_scope             TEXT NOT NULL DEFAULT '',
  provider_user_id        TEXT,
  provider_username       TEXT,
  allowed_models          TEXT NOT NULL DEFAULT 'flux,klein',
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pollinations_connections_expiry
  ON pollinations_connections(token_expires_at);
