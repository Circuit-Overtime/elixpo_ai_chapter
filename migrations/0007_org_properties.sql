-- Org profile properties
ALTER TABLE orgs ADD COLUMN bio TEXT DEFAULT '';
ALTER TABLE orgs ADD COLUMN website TEXT DEFAULT '';
ALTER TABLE orgs ADD COLUMN links TEXT DEFAULT '[]';
ALTER TABLE orgs ADD COLUMN featured_blog_ids TEXT DEFAULT '[]';
ALTER TABLE orgs ADD COLUMN logo_url TEXT DEFAULT '';
ALTER TABLE orgs ADD COLUMN banner_url TEXT DEFAULT '';

-- Org invite tokens (shareable URLs)
CREATE TABLE IF NOT EXISTS org_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'write',
  created_by TEXT NOT NULL REFERENCES users(id),
  max_uses INTEGER DEFAULT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org ON org_invites(org_id);
