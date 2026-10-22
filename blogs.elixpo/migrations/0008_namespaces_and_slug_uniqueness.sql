-- Unified namespace table: usernames and org slugs share the same pool.
-- A username "alice" blocks an org slug "alice" and vice versa.
CREATE TABLE IF NOT EXISTS namespaces (
  name TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,  -- 'user' | 'org'
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed existing usernames into namespaces
INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id, created_at)
  SELECT username, 'user', id, created_at FROM users WHERE username IS NOT NULL;

-- Seed existing org slugs into namespaces
INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id, created_at)
  SELECT slug, 'org', id, created_at FROM orgs WHERE slug IS NOT NULL;

-- Blog slugs must be globally unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_blogs_slug_unique ON blogs(slug);
