-- Canvas sub-pages: extend subpages with a kind discriminator and metadata blob.
-- kind = 'doc' (default, BlockNote document) | 'canvas' (lixsketch scene)
-- metadata = JSON with canvas-only fields (thumbnail key, scene byte size, viewport snapshot).
-- A blog can have at most 2 canvas sub-pages (enforced at the API layer, not via constraint).

ALTER TABLE subpages ADD COLUMN kind TEXT NOT NULL DEFAULT 'doc';
ALTER TABLE subpages ADD COLUMN metadata TEXT;

CREATE INDEX IF NOT EXISTS idx_subpages_blog_kind ON subpages(blog_id, kind);
