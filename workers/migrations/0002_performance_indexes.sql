-- Composite index for analytics queries (url_id + time range)
CREATE INDEX IF NOT EXISTS idx_clicks_url_date ON clicks(url_id, clicked_at);

-- Composite index for user URL list with sort
CREATE INDEX IF NOT EXISTS idx_urls_user_created ON urls(user_id, created_at DESC);

-- Composite index for user + short_code lookups (PATCH/DELETE)
CREATE INDEX IF NOT EXISTS idx_urls_user_short ON urls(user_id, short_code);

-- API key expiry lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, is_active);

-- Session cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Audit log user + time queries
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at DESC);
