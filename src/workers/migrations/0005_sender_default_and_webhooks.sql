-- mail.elixpo — sender default flag + webhooks become 1:many per template.
--
-- 1. A tenant can mark ONE sender as its default (used when a product/template
--    doesn't specify one). Enforced in app code (set one → clear the rest).
-- 2. Webhooks were 1:1 with a template (UNIQUE template_id); the model is now
--    1:many — a template can have several named webhook "events". The webhooks
--    table is empty at this point, so recreate it without the UNIQUE constraint.

ALTER TABLE senders ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS webhooks;

CREATE TABLE IF NOT EXISTS webhooks (
    id              TEXT PRIMARY KEY,                  -- whk_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    product_id      TEXT NOT NULL REFERENCES products(id),
    template_id     TEXT NOT NULL REFERENCES templates(id),  -- 1:many now (no UNIQUE)
    name            TEXT NOT NULL,                     -- user-given event name
    endpoint_key    TEXT NOT NULL UNIQUE,              -- public token in the trigger URL
    status          TEXT NOT NULL DEFAULT 'active',    -- active | disabled
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhooks_product ON webhooks(product_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_template ON webhooks(template_id);
