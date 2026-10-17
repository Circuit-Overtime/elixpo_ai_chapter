-- mail.elixpo — Google Drive connection per workspace.
--
-- Attachments are stored in the tenant's own Google Drive. The business connects
-- Drive once (Settings → Connections) via OAuth with the narrow `drive.file`
-- scope (+ openid/email to identify the account). We keep the OAuth tokens
-- encrypted at rest (same AES-GCM as sender app passwords) and refresh the
-- access token as needed. One connection per workspace (tenant_id PK).

CREATE TABLE IF NOT EXISTS drive_connections (
    tenant_id          TEXT PRIMARY KEY REFERENCES tenants(id),
    google_sub         TEXT,                       -- Google account subject id
    email              TEXT,                       -- connected account email (display)
    access_token_enc   TEXT NOT NULL,              -- encrypted access token
    refresh_token_enc  TEXT,                       -- encrypted refresh token (offline access)
    scope              TEXT,
    expiry             TEXT,                       -- ISO time the access token expires
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
