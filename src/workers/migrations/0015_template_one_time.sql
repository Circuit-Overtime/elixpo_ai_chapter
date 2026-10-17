-- mail.elixpo — one-time templates.
--
-- A template can now exist with NO product attached (product_id NULL): a
-- "one-time" template the user composes and sends directly, with no webhook and
-- no parent product to inherit a footer from. Such templates carry their own
-- footer in footer_json. Product-backed templates (product_id NOT NULL) are
-- unchanged and still inherit the product footer at send time.
--
-- SQLite can't drop a NOT NULL constraint in place, so rebuild the table.
-- webhooks / deliveries / template_attachments all reference templates(id).
--
-- ⚠️ APPLY THIS MIGRATION WITH `wrangler d1 execute --file`, NOT `migrations apply`.
--   `migrations apply` runs the file inside a single transaction, where
--   `PRAGMA foreign_keys=OFF` is a no-op and the rebuild trips the children's FK
--   on DROP/RENAME (`defer_foreign_keys` can't save it either: DROP's implicit
--   row-delete bumps the deferred-violation counter and, because the replacement
--   rows land in a differently-named table, it's never cleared, so COMMIT fails).
--   `execute --file` runs the statements on a bare connection, so
--   `PRAGMA foreign_keys=OFF` holds for the whole rebuild and it succeeds:
--     npx wrangler d1 execute elixpo_mail --remote --file src/workers/migrations/0015_template_one_time.sql
--   then record it so the tracker stays in sync:
--     npx wrangler d1 execute elixpo_mail --remote --command \
--       "INSERT INTO d1_migrations (name) VALUES ('0015_template_one_time.sql');"
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS templates_new;

CREATE TABLE templates_new (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    product_id      TEXT REFERENCES products(id),       -- NULL = one-time template
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'custom',
    subject         TEXT NOT NULL DEFAULT '',
    content_json    TEXT,
    content_html    TEXT,
    variables_json  TEXT,
    sender_id       TEXT REFERENCES senders(id),
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    bg_color        TEXT,
    transactional   INTEGER NOT NULL DEFAULT 0,
    footer_json     TEXT,                               -- per-template footer (one-time templates)
    UNIQUE(product_id, slug)
);

INSERT INTO templates_new
    (id, tenant_id, product_id, slug, name, kind, subject, content_json, content_html,
     variables_json, sender_id, status, created_at, updated_at, bg_color, transactional, footer_json)
SELECT
    id, tenant_id, product_id, slug, name, kind, subject, content_json, content_html,
    variables_json, sender_id, status, created_at, updated_at, bg_color, transactional, NULL
FROM templates;

DROP TABLE templates;
ALTER TABLE templates_new RENAME TO templates;

CREATE INDEX IF NOT EXISTS idx_templates_product ON templates(product_id);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);

PRAGMA foreign_keys=ON;
