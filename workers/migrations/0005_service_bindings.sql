-- Explicit consent for first-party Elixpo services acting on a LixRL account.
-- Revoking a binding stops future delegated actions but leaves existing links
-- intact under the user's LixRL account.
CREATE TABLE IF NOT EXISTS service_bindings (
  user_id INTEGER NOT NULL,
  service TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT,
  PRIMARY KEY (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_bindings_service_active
  ON service_bindings(service, revoked_at);
