-- Optional creator-owned Cloudinary product environments.
-- Secrets are AES-GCM encrypted by the application before being stored.
CREATE TABLE IF NOT EXISTS cloudinary_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cloud_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Existing rows remain attached to the LixBlogs-managed Cloudinary account.
ALTER TABLE media_uploads ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'platform_cloudinary';
ALTER TABLE media_uploads ADD COLUMN storage_cloud_name TEXT;
ALTER TABLE media_uploads ADD COLUMN secure_url TEXT;

CREATE INDEX IF NOT EXISTS idx_media_uploads_provider
  ON media_uploads(user_id, storage_provider);
