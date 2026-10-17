-- User tier: 'free' (default) or 'member'
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';

-- Storage usage tracking (bytes, updated on each upload/delete)
ALTER TABLE users ADD COLUMN storage_used_bytes INTEGER NOT NULL DEFAULT 0;

-- AI usage tracking (daily counter, reset when date changes)
ALTER TABLE users ADD COLUMN ai_usage_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ai_usage_date TEXT;

-- Member-only blog gating
ALTER TABLE blogs ADD COLUMN member_only INTEGER NOT NULL DEFAULT 0;

-- Track per-image storage for cleanup/accounting (Cloudinary)
CREATE TABLE IF NOT EXISTS media_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  blog_id TEXT REFERENCES blogs(id) ON DELETE SET NULL,
  cloudinary_public_id TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_user ON media_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_blog ON media_uploads(blog_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_cloudinary ON media_uploads(cloudinary_public_id);
