-- 0019_device_authorizations.sql
--
-- RFC 8628 device authorization grant — foundation for the LixBlogs CLI
-- (elixpo/blogs.elixpo#135), tracked by accounts.elixpo#79 (part of #73).
--
-- 1. oauth_clients.client_type
--    Public CLI clients don't hold a client secret. Existing rows default
--    to 'confidential' so current authorization-code behavior is
--    unchanged. `client_secret_hash` stays NOT NULL for public clients
--    too (an unused, never-issued hash) — the device endpoints simply
--    never check it for client_type = 'public'.
--
-- 2. device_authorizations
--    Pending/resolved device grants. Raw device_code and user_code are
--    NEVER stored — only SHA-256 hashes (device_code_hash, user_code_hash).
--    The verification-page lookup normalizes user input the same way at
--    read time and matches on the hash, so the raw code never needs to be
--    persisted or logged.

ALTER TABLE oauth_clients ADD COLUMN client_type TEXT NOT NULL DEFAULT 'confidential'
    CHECK (client_type IN ('confidential', 'public'));

CREATE TABLE IF NOT EXISTS device_authorizations (
    id TEXT PRIMARY KEY,
    device_code_hash TEXT UNIQUE NOT NULL,
    user_code_hash TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    audience TEXT,
    scopes TEXT NOT NULL,                 -- space-delimited, same convention as auth_requests.scopes
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
    user_id TEXT,                         -- set on approval
    interval_seconds INTEGER NOT NULL DEFAULT 5,
    last_polled_at DATETIME,
    poll_count INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,                      -- issuing IP, for abuse review only (never the code itself)
    expires_at DATETIME NOT NULL,
    approved_at DATETIME,
    denied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- device_code_hash / user_code_hash already get a unique index from the
-- UNIQUE constraints above. These cover the remaining lookup + cleanup
-- access patterns.
CREATE INDEX IF NOT EXISTS idx_device_auth_client_id ON device_authorizations(client_id);
CREATE INDEX IF NOT EXISTS idx_device_auth_status_expires ON device_authorizations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_device_auth_expires_at ON device_authorizations(expires_at);
