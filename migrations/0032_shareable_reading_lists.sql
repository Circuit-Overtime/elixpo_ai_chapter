-- Make bookmark collections shareable reading lists: a URL slug (unique per
-- user) and a public flag for /<username>/reads/<slug>.
ALTER TABLE bookmark_collections ADD COLUMN slug TEXT;
ALTER TABLE bookmark_collections ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
