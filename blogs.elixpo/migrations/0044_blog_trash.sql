ALTER TABLE blogs ADD COLUMN deleted_at INTEGER;
ALTER TABLE blogs ADD COLUMN pre_delete_status TEXT;

CREATE INDEX IF NOT EXISTS idx_blogs_author_deleted ON blogs(author_id, deleted_at, updated_at DESC);
