-- Add collection_id to blogs for collection-based publishing
ALTER TABLE blogs ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blogs_collection ON blogs(collection_id);
