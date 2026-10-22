-- Add workspace tracking columns
ALTER TABLE scenes ADD COLUMN last_accessed_at TEXT DEFAULT (datetime('now'));
ALTER TABLE scenes ADD COLUMN owner_type TEXT DEFAULT 'guest'; -- 'guest' or 'user'

-- Index for cleanup queries (find stale workspaces)
CREATE INDEX IF NOT EXISTS idx_scenes_last_accessed ON scenes(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_scenes_owner ON scenes(created_by, owner_type);
