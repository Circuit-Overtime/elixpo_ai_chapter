-- Authoritative daily creation quota for signed-in free accounts. Risk
-- metadata is a keyed, pseudonymous request signal; raw IP/header values are
-- never persisted.
CREATE TABLE IF NOT EXISTS user_creation_quotas (
  user_id INTEGER PRIMARY KEY,
  window_start TEXT NOT NULL,
  created_count INTEGER NOT NULL DEFAULT 0 CHECK(created_count >= 0),
  last_fingerprint_hash TEXT,
  last_risk_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_creation_quotas_window
  ON user_creation_quotas(window_start);
