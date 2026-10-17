-- Public workspace templates are immutable snapshots of a user's workspace.
-- Their key is intentionally public, but it is never the editable workspace key.
CREATE TABLE IF NOT EXISTS workspace_templates (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  publisher_user_id   TEXT NOT NULL,
  source_session_id   TEXT,
  title               TEXT NOT NULL,
  description         TEXT DEFAULT '',
  tags_json           TEXT DEFAULT '[]',
  cover_data_url      TEXT,
  encrypted_data      TEXT NOT NULL,
  public_key          TEXT NOT NULL,
  encrypted_doc_data  TEXT,
  format_version      INTEGER DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'published',
  view_count          INTEGER DEFAULT 0,
  fork_count          INTEGER DEFAULT 0,
  clone_count         INTEGER DEFAULT 0,
  published_at        TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_templates_status_published
  ON workspace_templates(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_templates_publisher
  ON workspace_templates(publisher_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_template_instances (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL REFERENCES workspace_templates(id) ON DELETE CASCADE,
  scene_id      TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK(mode IN ('fork', 'clone')),
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_template_instances_template
  ON workspace_template_instances(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_instances_user
  ON workspace_template_instances(user_id, created_at DESC);
