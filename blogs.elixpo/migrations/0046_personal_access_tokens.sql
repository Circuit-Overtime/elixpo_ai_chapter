CREATE TABLE IF NOT EXISTS api_personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (resource_type IN ('personal', 'organization')),
  organization_id TEXT,
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CHECK (
    (resource_type = 'personal' AND organization_id IS NULL)
    OR (resource_type = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_api_pat_user_created
  ON api_personal_access_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_pat_org
  ON api_personal_access_tokens(organization_id, user_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_pat_active_expiry
  ON api_personal_access_tokens(expires_at)
  WHERE revoked_at IS NULL;
