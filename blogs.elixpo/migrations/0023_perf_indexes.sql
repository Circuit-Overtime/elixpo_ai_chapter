-- Index on org_members.user_id.
-- The PK is (org_id, user_id), so "which orgs is this user in / can this user
-- write to this org?" lookups (run on every publish/draft permission check via
-- canEditBlog) couldn't use the PK prefix and scanned. This index fixes that.
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
