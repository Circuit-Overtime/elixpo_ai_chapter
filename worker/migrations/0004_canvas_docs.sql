-- Per-canvas WYSIWYG document content (paired 1:1 with a scene/session).
-- Encrypted with the same per-session key used for scenes so that a scene
-- and its doc share fate: same workspace, same key, same delete cascade.
-- NOTE: We don't declare a real FK because scenes.session_id has no UNIQUE
-- constraint (existing schema only enforces uniqueness via app logic), and
-- D1 SQLite requires the parent column to be UNIQUE/PK for FK references.
-- Cascade-on-scene-delete is implemented in handleSceneDelete instead.
CREATE TABLE IF NOT EXISTS canvas_docs (
  session_id      TEXT PRIMARY KEY,
  encrypted_data  TEXT NOT NULL,
  created_by      TEXT,
  client_id       TEXT,
  size_bytes      INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_canvas_docs_updated ON canvas_docs(updated_at);
CREATE INDEX IF NOT EXISTS idx_canvas_docs_creator ON canvas_docs(created_by);

-- Track the user's last-used layout per canvas so reload restores it.
ALTER TABLE scenes ADD COLUMN layout_mode TEXT DEFAULT 'canvas';
