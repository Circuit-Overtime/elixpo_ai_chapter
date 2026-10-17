-- mail.elixpo — Product model reshape.
-- Introduces a Product layer between tenant and templates:
--   tenant -> products (client_id + one shared secret, HMAC-verified) -> templates
--   each template has exactly ONE webhook (1:1); template sends through the
--   product's default sender, optionally overridden per template.
-- The old email_configs / inbound_events tables are absorbed into products /
-- webhooks. All affected tables are empty at this point (only tenant_elixpo is
-- seeded), so we drop and recreate rather than ALTER.

-- Drop obsolete / reshaped tables, children first.
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS inbound_events;
DROP TABLE IF EXISTS email_configs;
DROP TABLE IF EXISTS templates;

-- ─── Products (credential holder + template group) ──────────────────────────

-- A product groups templates and owns the credentials a tenant's service uses
-- to trigger sends. client_id is the public principal; the shared secret
-- (lix_mail_…) is shown once and stored only as a sha256 hash. Inbound trigger
-- calls are authenticated by HMAC over the request body using this secret.
CREATE TABLE IF NOT EXISTS products (
    id                        TEXT PRIMARY KEY,        -- prod_xxx
    tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
    name                      TEXT NOT NULL,
    client_id                 TEXT NOT NULL UNIQUE,    -- public slug / principal
    secret_hash               TEXT,                    -- sha256(shared secret)
    prev_secret_hash          TEXT,                    -- previous secret during rotation grace
    prev_secret_expires_at    TEXT,
    default_sender_id         TEXT REFERENCES senders(id), -- sender used unless a template overrides
    status                    TEXT NOT NULL DEFAULT 'active', -- active | disabled
    created_at                TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- ─── Templates (now belong to a product) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS templates (
    id              TEXT PRIMARY KEY,                  -- tmpl_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    product_id      TEXT NOT NULL REFERENCES products(id),
    slug            TEXT NOT NULL,                     -- unique within the product
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'custom',    -- 'custom' | 'receipt' (first-class)
    subject         TEXT NOT NULL DEFAULT '',          -- may contain {{vars}}
    content_json    TEXT,                              -- lixeditor document (source of truth)
    content_html    TEXT,                              -- cached email-safe inlined HTML
    variables_json  TEXT,                              -- declared {{vars}}: ["name","amount"]
    sender_id       TEXT REFERENCES senders(id),       -- optional override of product default
    status          TEXT NOT NULL DEFAULT 'active',    -- active | archived
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_templates_product ON templates(product_id);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);

-- ─── Webhooks (1:1 with a template) ─────────────────────────────────────────

-- A user-named inbound trigger bound to exactly one template (UNIQUE template_id).
-- The public endpoint is /v1/hooks/<endpoint_key>; the call is HMAC-signed with
-- the parent product's shared secret.
CREATE TABLE IF NOT EXISTS webhooks (
    id              TEXT PRIMARY KEY,                  -- whk_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    product_id      TEXT NOT NULL REFERENCES products(id),
    template_id     TEXT NOT NULL UNIQUE REFERENCES templates(id), -- 1:1
    name            TEXT NOT NULL,                     -- user-given trigger name
    endpoint_key    TEXT NOT NULL UNIQUE,              -- public token in the trigger URL
    status          TEXT NOT NULL DEFAULT 'active',    -- active | disabled
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhooks_product ON webhooks(product_id);

-- ─── Delivery logs (re-parented to product / template / webhook) ────────────

CREATE TABLE IF NOT EXISTS deliveries (
    id              TEXT PRIMARY KEY,                  -- dlv_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    product_id      TEXT REFERENCES products(id),
    template_id     TEXT REFERENCES templates(id),
    webhook_id      TEXT REFERENCES webhooks(id),
    sender_id       TEXT REFERENCES senders(id),
    to_email        TEXT NOT NULL,
    subject         TEXT,
    status          TEXT NOT NULL DEFAULT 'queued',    -- queued | sending | sent | failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,                              -- last error message
    smtp_response   TEXT,                              -- final SMTP server reply
    vars_json       TEXT,                              -- variables used for this render
    idempotency_key TEXT,                              -- caller-supplied dedupe key
    queued_at       TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant ON deliveries(tenant_id, queued_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_product ON deliveries(product_id);
