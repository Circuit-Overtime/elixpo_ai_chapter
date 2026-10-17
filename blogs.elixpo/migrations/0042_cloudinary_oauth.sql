-- OAuth credentials for creator-owned Cloudinary product environments.
-- The API-key columns remain for backwards compatibility with connections
-- created before the OAuth flow was introduced.
ALTER TABLE cloudinary_connections ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'api_secret';
ALTER TABLE cloudinary_connections ADD COLUMN access_token_encrypted TEXT;
ALTER TABLE cloudinary_connections ADD COLUMN refresh_token_encrypted TEXT;
ALTER TABLE cloudinary_connections ADD COLUMN access_token_expires_at INTEGER;
ALTER TABLE cloudinary_connections ADD COLUMN oauth_scope TEXT;
ALTER TABLE cloudinary_connections ADD COLUMN refresh_lock_until INTEGER;

CREATE INDEX IF NOT EXISTS idx_cloudinary_connections_refresh
  ON cloudinary_connections(auth_method, access_token_expires_at);
