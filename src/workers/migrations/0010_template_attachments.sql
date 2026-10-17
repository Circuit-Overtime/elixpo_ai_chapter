-- mail.elixpo — template attachments (Gmail-style file chips on a template).
--
-- An attachment is a *source* resolved at send time into real MIME bytes:
--   kind 'drive'    → a Google Drive file id (downloaded via the workspace's
--                     Drive connection)
--   kind 'url'      → any public URL (fetched directly)
--   kind 'variable' → the source contains {{vars}} resolved per-send from the
--                     trigger payload (e.g. {{invoice_url}}), so different sends
--                     of the same template can carry different files.
-- filename may also contain {{vars}}. We never store file bytes — only the
-- pointer — so storage stays tiny and per-send files stay dynamic.

CREATE TABLE IF NOT EXISTS template_attachments (
    id            TEXT PRIMARY KEY,                 -- att_xxx
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    template_id   TEXT NOT NULL REFERENCES templates(id),
    kind          TEXT NOT NULL,                    -- drive | url | variable
    source        TEXT NOT NULL,                    -- drive id, URL, or {{var}} expr
    filename      TEXT,                             -- display/attachment name (may contain {{var}})
    mime          TEXT,                             -- optional content-type hint
    size          INTEGER,                          -- optional known size (bytes)
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_template ON template_attachments(template_id);
