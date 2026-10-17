-- Turn shareable reading lists into first-class curated collections without
-- coupling them to private bookmarks. A blog can appear in many collections.
ALTER TABLE bookmark_collections ADD COLUMN introduction TEXT NOT NULL DEFAULT '';
ALTER TABLE bookmark_collections ADD COLUMN cover_url TEXT;
ALTER TABLE bookmark_collections ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'unlisted', 'public'));

UPDATE bookmark_collections
SET visibility = CASE WHEN is_public = 1 THEN 'public' ELSE 'private' END;

CREATE TABLE IF NOT EXISTS curated_collection_entries (
  collection_id TEXT NOT NULL REFERENCES bookmark_collections(id) ON DELETE CASCADE,
  blog_id TEXT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL DEFAULT 0,
  curator_note TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (collection_id, blog_id)
);

CREATE INDEX IF NOT EXISTS idx_curated_entries_order
  ON curated_collection_entries(collection_id, position, added_at);
CREATE INDEX IF NOT EXISTS idx_curated_entries_blog
  ON curated_collection_entries(blog_id);

-- Existing public reading lists remain populated after the migration.
INSERT OR IGNORE INTO curated_collection_entries
  (collection_id, blog_id, added_by, position, added_at, updated_at)
SELECT b.collection_id, b.blog_id, b.user_id,
  ROW_NUMBER() OVER (PARTITION BY b.collection_id ORDER BY b.created_at),
  b.created_at, b.created_at
FROM bookmarks b
WHERE b.collection_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS curation_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_public_curation INTEGER NOT NULL DEFAULT 1,
  default_license TEXT NOT NULL DEFAULT 'all-rights-reserved',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Licenses describe how the original work may be reused. Adding a post to a
-- collection never changes this value or grants rights to the curator.
ALTER TABLE blogs ADD COLUMN license TEXT NOT NULL DEFAULT 'all-rights-reserved';
