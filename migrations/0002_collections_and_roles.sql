-- Migration 0002: Collections and roles
-- All changes in this migration were applied manually prior to migration tracking.
-- This file is kept as a no-op to maintain migration history consistency.

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_r2_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blogs_slugid ON blogs(slugid);
CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(org_id);
-- idx_blogs_collection is created in 0013 (after collection_id column is added).
