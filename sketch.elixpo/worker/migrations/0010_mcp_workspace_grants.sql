ALTER TABLE scenes ADD COLUMN agent_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS mcp_workspace_grants (
  id            TEXT PRIMARY KEY,
  scene_id      TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL DEFAULT 'MCP client',
  permission    TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('read', 'edit')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_grants_scene ON mcp_workspace_grants(scene_id);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_workspace_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_hash ON mcp_workspace_grants(token_hash);
