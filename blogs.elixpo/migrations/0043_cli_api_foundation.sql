-- Versioned CLI API operational state. No access or refresh token material is stored here.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  subject_id TEXT NOT NULL,
  route TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (subject_id, route, window_start)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expiry ON api_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS api_audit_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_api_audit_user_time ON api_audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_request ON api_audit_events(request_id);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expiry ON api_idempotency_keys(expires_at);
