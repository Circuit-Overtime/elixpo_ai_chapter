-- mail.elixpo — multi-member workspaces, roles, and invites.
--
-- A tenant becomes a "workspace": it gains a public slug + cosmetics (name was
-- already there; add description + logo), and a membership table so several
-- users can collaborate with roles instead of sharing login credentials.
--
-- Roles (highest → lowest): owner > admin > writer > viewer.
--   owner   — the creator; full control, can't be removed
--   admin   — manage members/invites + everything a writer can do
--   writer  — create/edit senders, products, templates; send
--   viewer  — read-only
-- A member with status 'pending' is a join request awaiting admin approval.

ALTER TABLE tenants ADD COLUMN slug        TEXT;
ALTER TABLE tenants ADD COLUMN description TEXT;
ALTER TABLE tenants ADD COLUMN logo_url    TEXT;

-- Backfill a usable slug for existing workspaces (the id is unique + URL-safe).
UPDATE tenants SET slug = id WHERE slug IS NULL;

CREATE TABLE IF NOT EXISTS workspace_members (
    id          TEXT PRIMARY KEY,                  -- wm_xxx
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    user_uid    TEXT,                              -- Elixpo Accounts subject (null until they sign in)
    email       TEXT NOT NULL,                     -- lowercased
    name        TEXT,
    role        TEXT NOT NULL DEFAULT 'viewer',    -- owner | admin | writer | viewer
    status      TEXT NOT NULL DEFAULT 'active',    -- active | pending | removed
    invited_by  TEXT,                              -- uid/email of the inviter
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_members_tenant ON workspace_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_uid ON workspace_members(user_uid);

CREATE TABLE IF NOT EXISTS workspace_invites (
    id          TEXT PRIMARY KEY,                  -- inv_xxx
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    email       TEXT,                              -- email-specific invite, or NULL for an open link
    role        TEXT NOT NULL DEFAULT 'viewer',    -- role granted on accept
    token       TEXT NOT NULL UNIQUE,              -- public token in the invite link
    status      TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | revoked
    invited_by  TEXT,
    expires_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invites_tenant ON workspace_invites(tenant_id);

-- Seed the existing owner of each workspace as an 'owner' member.
INSERT OR IGNORE INTO workspace_members (id, tenant_id, user_uid, email, role, status)
SELECT 'wm_' || lower(hex(randomblob(12))), id, owner_uid, lower(COALESCE(email, owner_uid || '@unknown')), 'owner', 'active'
FROM tenants
WHERE owner_uid IS NOT NULL;
