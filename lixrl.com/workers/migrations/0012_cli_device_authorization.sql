CREATE TABLE cli_auth_requests (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  poll_secret_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
  key_name TEXT,
  scopes TEXT,
  key_expires_at TEXT,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_cli_auth_requests_user_status
  ON cli_auth_requests(user_id, status, expires_at);
