-- mail.elixpo — initial schema
-- Timestamps are ISO-8601 TEXT (UTC). IDs are prefixed opaque strings (see ids.ts).
-- Multi-tenant from day one: tenant -> senders / templates / email_configs -> deliveries.
-- Secrets discipline: sender app passwords are ENCRYPTED at rest (AES-GCM); API
-- secret keys are stored only as a sha256 hash and shown to the user once.

-- ─── Tenancy ────────────────────────────────────────────────────────────────

-- A tenant is a business. One per Elixpo Accounts user (owner_uid = SSO subject).
CREATE TABLE IF NOT EXISTS tenants (
    id            TEXT PRIMARY KEY,                 -- tenant_xxx
    name          TEXT NOT NULL,
    email         TEXT,
    owner_uid     TEXT,                             -- Elixpo Accounts subject
    status        TEXT NOT NULL DEFAULT 'active',   -- active | suspended
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_uid);

-- ─── Senders ────────────────────────────────────────────────────────────────

-- A sender is the tenant's OWN mailbox we relay through (their email + app
-- password). The app password is encrypted at rest — never returned by the API.
CREATE TABLE IF NOT EXISTS senders (
    id                TEXT PRIMARY KEY,             -- snd_xxx
    tenant_id         TEXT NOT NULL REFERENCES tenants(id),
    email             TEXT NOT NULL,                -- envelope/from address
    display_name      TEXT,                         -- "Acme Support"
    smtp_host         TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port         INTEGER NOT NULL DEFAULT 465, -- 465 implicit TLS (our verified path)
    smtp_secure       TEXT NOT NULL DEFAULT 'tls',  -- 'tls' (implicit) | 'starttls'
    username          TEXT,                         -- SMTP auth user; defaults to email
    -- AES-GCM ciphertext (base64) of the app password. Encrypted with
    -- ELIXPO_MAIL_ENCRYPTION_KEY. Plaintext is never stored or returned.
    app_password_enc  TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'active', -- active | disabled
    last_verified_at  TEXT,                         -- set after a successful send-test
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_senders_tenant ON senders(tenant_id);

-- ─── Templates ──────────────────────────────────────────────────────────────

-- A template is lixeditor content with {{variable}} placeholders. We keep the
-- editor document (content_json) as the source of truth and cache an
-- email-safe inlined HTML render (content_html) for sending.
CREATE TABLE IF NOT EXISTS templates (
    id              TEXT PRIMARY KEY,               -- tmpl_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    slug            TEXT NOT NULL,                  -- referenced by the send API
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'custom', -- 'custom' | 'receipt' (first-class)
    subject         TEXT NOT NULL DEFAULT '',       -- may contain {{vars}}
    content_json    TEXT,                           -- lixeditor document (source of truth)
    content_html    TEXT,                           -- cached email-safe inlined HTML
    variables_json  TEXT,                           -- declared {{vars}}: ["name","amount"]
    status          TEXT NOT NULL DEFAULT 'active', -- active | archived
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);

-- ─── Email configs (per-config credentials) ─────────────────────────────────

-- An email config is a credentialed send endpoint. client_id is a public slug;
-- the secret key (lix_mail_…) is shown ONCE and stored only as a sha256 hash.
-- prev_* columns support credential rotation with a grace window.
CREATE TABLE IF NOT EXISTS email_configs (
    id                       TEXT PRIMARY KEY,      -- cfg_xxx
    tenant_id                TEXT NOT NULL REFERENCES tenants(id),
    name                     TEXT NOT NULL,
    client_id                TEXT NOT NULL UNIQUE,  -- public slug, Bearer-auth principal
    api_key_hash             TEXT,                  -- sha256(secret key)
    prev_api_key_hash        TEXT,                  -- previous key during rotation grace
    prev_api_key_expires_at  TEXT,
    default_sender_id        TEXT REFERENCES senders(id), -- sender used when send omits one
    status                   TEXT NOT NULL DEFAULT 'active', -- active | disabled
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_configs_tenant ON email_configs(tenant_id);

-- ─── Inbound trigger receipts (idempotency / audit) ─────────────────────────

-- One row per inbound trigger webhook hit. Dedupes retries via idempotency_key.
CREATE TABLE IF NOT EXISTS inbound_events (
    id               TEXT PRIMARY KEY,              -- whe_xxx
    config_id        TEXT NOT NULL REFERENCES email_configs(id),
    template_slug    TEXT,
    idempotency_key  TEXT,
    to_email         TEXT,
    delivery_id      TEXT,                          -- resulting delivery, if any
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(config_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_inbound_config ON inbound_events(config_id);

-- ─── Delivery logs ──────────────────────────────────────────────────────────

-- One row per send attempt. Written queued by the Pages API, advanced to
-- sent/failed by the SMTP consumer Worker.
CREATE TABLE IF NOT EXISTS deliveries (
    id              TEXT PRIMARY KEY,               -- dlv_xxx
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    config_id       TEXT REFERENCES email_configs(id),
    template_id     TEXT REFERENCES templates(id),
    sender_id       TEXT REFERENCES senders(id),
    to_email        TEXT NOT NULL,
    subject         TEXT,
    status          TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,                           -- last error message
    smtp_response   TEXT,                           -- final SMTP server reply
    vars_json       TEXT,                           -- variables used for this render
    queued_at       TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant ON deliveries(tenant_id, queued_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
