CREATE TABLE IF NOT EXISTS cloudinary_connections (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cloud_name               TEXT NOT NULL,
  enabled                  INTEGER NOT NULL DEFAULT 1,
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT NOT NULL,
  access_token_expires_at  INTEGER NOT NULL,
  oauth_scope              TEXT,
  refresh_lock_until       INTEGER,
  created_at               INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cloudinary_connections_refresh
  ON cloudinary_connections(access_token_expires_at);

ALTER TABLE image_assets ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'platform_cloudinary';
ALTER TABLE image_assets ADD COLUMN storage_cloud_name TEXT;
ALTER TABLE image_assets ADD COLUMN secure_url TEXT;
ALTER TABLE image_assets ADD COLUMN uploaded_by TEXT;

CREATE INDEX IF NOT EXISTS idx_image_assets_uploader_provider
  ON image_assets(uploaded_by, storage_provider);
