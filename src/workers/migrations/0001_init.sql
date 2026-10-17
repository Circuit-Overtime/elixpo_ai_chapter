-- Elixpo Pay — P0 initial schema
-- Money discipline: integer minor units everywhere (paise for INR, cents for USD).
-- Timestamps are ISO-8601 TEXT (UTC). IDs are prefixed opaque strings.
-- Multi-tenant from day one (merchant -> app), but P0 is first-party only
-- (merchant = Elixpo, app = lixblogs). Forward-compatible with P1+ (ledger,
-- wallets, payouts, pools) without a destructive rewrite.

-- ─── Tenancy ────────────────────────────────────────────────────────────────

-- A merchant is a tenant. P0: the only merchant is Elixpo itself.
CREATE TABLE IF NOT EXISTS merchants (
    id            TEXT PRIMARY KEY,             -- mer_xxx
    name          TEXT NOT NULL,
    email         TEXT,
    -- Elixpo Accounts user id of the owner (SSO subject), nullable in P0
    owner_uid     TEXT,
    status        TEXT NOT NULL DEFAULT 'active', -- active | suspended
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An app/project belongs to a merchant. blogs.elixpo = app slug 'lixblogs'.
CREATE TABLE IF NOT EXISTS apps (
    id            TEXT PRIMARY KEY,             -- app_xxx
    merchant_id   TEXT NOT NULL REFERENCES merchants(id),
    slug          TEXT NOT NULL UNIQUE,         -- 'lixblogs'
    name          TEXT NOT NULL,
    -- Hash of the secret API key gating server-to-server calls (entitlements API).
    -- The key itself is shown once at creation and never stored in plaintext.
    api_key_hash  TEXT,
    -- Default URL we redirect back to after checkout if a session omits one.
    return_url    TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apps_merchant ON apps(merchant_id);

-- Provider connections: which payment providers an app can charge through.
-- P0 uses Elixpo's own Razorpay keys from env (secret_ref points at the env
-- var name, not the secret). BYO encrypted keys land in P2.
CREATE TABLE IF NOT EXISTS provider_connections (
    id            TEXT PRIMARY KEY,             -- pc_xxx
    app_id        TEXT NOT NULL REFERENCES apps(id),
    provider      TEXT NOT NULL,                -- 'razorpay' | 'stripe' | ...
    -- For P0: 'env' means keys are read from server env. P2: 'byo' (encrypted).
    mode          TEXT NOT NULL DEFAULT 'env',
    publishable   TEXT,                         -- safe-to-expose key id (optional)
    secret_ref    TEXT,                         -- env var name OR encrypted blob ref
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(app_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_pc_app ON provider_connections(app_id);

-- ─── Catalog ────────────────────────────────────────────────────────────────

-- A product is a sellable thing (e.g. "Blogs Member"). Maps to an entitlement
-- tier that consuming apps understand.
CREATE TABLE IF NOT EXISTS products (
    id            TEXT PRIMARY KEY,             -- prod_xxx
    app_id        TEXT NOT NULL REFERENCES apps(id),
    name          TEXT NOT NULL,
    -- The tier string the app grants on purchase (e.g. 'member').
    tier          TEXT NOT NULL,
    description   TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_app ON products(app_id);

-- A price is a regional/PPP variant of a product. P0 supports one-time billing
-- (interval='month' with type='one_time' means "grant 30 days, renew manually").
CREATE TABLE IF NOT EXISTS prices (
    id            TEXT PRIMARY KEY,             -- price_xxx
    product_id    TEXT NOT NULL REFERENCES products(id),
    currency      TEXT NOT NULL,                -- 'INR' | 'USD' (ISO-4217)
    -- Amount in the smallest currency unit (paise/cents).
    unit_amount   INTEGER NOT NULL,
    -- 'one_time' (P0) | 'recurring' (P1, true mandates)
    type          TEXT NOT NULL DEFAULT 'one_time',
    -- Billing interval the grant covers. P0: one charge => `interval_count`
    -- of `interval` of entitlement (default 1 month / 30 days).
    interval      TEXT NOT NULL DEFAULT 'month', -- day | week | month | year
    interval_count INTEGER NOT NULL DEFAULT 1,
    -- Region code(s) this price targets (cf-ipcountry). NULL = default/global.
    region        TEXT,
    provider      TEXT NOT NULL DEFAULT 'razorpay',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id);
CREATE INDEX IF NOT EXISTS idx_prices_currency ON prices(currency);

-- ─── Customers ──────────────────────────────────────────────────────────────

-- A customer is the buyer, keyed by the consuming app's external user id (uid).
-- One row per (app, external_uid).
CREATE TABLE IF NOT EXISTS customers (
    id            TEXT PRIMARY KEY,             -- cus_xxx
    app_id        TEXT NOT NULL REFERENCES apps(id),
    external_uid  TEXT NOT NULL,                -- the app's user id
    email         TEXT,
    name          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(app_id, external_uid)
);
CREATE INDEX IF NOT EXISTS idx_customers_app_uid ON customers(app_id, external_uid);

-- ─── Checkout ───────────────────────────────────────────────────────────────

-- A hosted checkout session, created from the signed handoff blogs sends to
-- /checkout. Drives the Razorpay order and, on capture, the grant.
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id              TEXT PRIMARY KEY,           -- cs_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    customer_id     TEXT REFERENCES customers(id),
    external_uid    TEXT NOT NULL,              -- denormalized for fast lookup
    product_id      TEXT REFERENCES products(id),
    price_id        TEXT REFERENCES prices(id),
    provider        TEXT NOT NULL DEFAULT 'razorpay',
    -- The provider order id (Razorpay order_xxx) once created.
    provider_order_id TEXT,
    currency        TEXT NOT NULL,
    amount          INTEGER NOT NULL,           -- minor units, snapshot of price
    -- open | completed | expired | cancelled
    status          TEXT NOT NULL DEFAULT 'open',
    -- Where to send the user back after success/cancel.
    return_url      TEXT,
    -- The transaction that fulfilled this session (set on capture).
    transaction_id  TEXT,
    metadata        TEXT,                        -- JSON blob (plan label, etc.)
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cs_app_uid ON checkout_sessions(app_id, external_uid);
CREATE INDEX IF NOT EXISTS idx_cs_provider_order ON checkout_sessions(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON checkout_sessions(status);

-- ─── Money ──────────────────────────────────────────────────────────────────

-- A transaction is one charge attempt/result. Idempotent on provider_payment_id.
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,           -- txn_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    customer_id     TEXT REFERENCES customers(id),
    checkout_session_id TEXT REFERENCES checkout_sessions(id),
    provider        TEXT NOT NULL,
    provider_order_id   TEXT,
    -- Razorpay payment id (pay_xxx). UNIQUE => natural idempotency guard.
    provider_payment_id TEXT,
    currency        TEXT NOT NULL,
    amount          INTEGER NOT NULL,           -- minor units
    fee             INTEGER NOT NULL DEFAULT 0, -- provider fee, minor units
    tax             INTEGER NOT NULL DEFAULT 0,
    -- created | authorized | captured | failed | refunded
    status          TEXT NOT NULL DEFAULT 'created',
    error_code      TEXT,
    raw             TEXT,                        -- raw provider payload (JSON)
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_txn_provider_payment
    ON transactions(provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_txn_app ON transactions(app_id);
CREATE INDEX IF NOT EXISTS idx_txn_session ON transactions(checkout_session_id);

-- A subscription is the recurring intent. P0 one-time model: each successful
-- charge (re)sets current_period_end = now + interval; status drives renewal.
CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,           -- sub_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    customer_id     TEXT NOT NULL REFERENCES customers(id),
    product_id      TEXT REFERENCES products(id),
    price_id        TEXT REFERENCES prices(id),
    tier            TEXT NOT NULL,
    -- active | past_due | cancelled | expired
    status          TEXT NOT NULL DEFAULT 'active',
    -- P0: 'one_time' (manual renew). P1: 'recurring' (provider mandate).
    billing_mode    TEXT NOT NULL DEFAULT 'one_time',
    current_period_start TEXT,
    current_period_end   TEXT,                   -- = the entitlement expiry
    cancel_at       TEXT,
    provider_subscription_id TEXT,               -- null in P0 one-time
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sub_app ON subscriptions(app_id);
CREATE INDEX IF NOT EXISTS idx_sub_period_end ON subscriptions(current_period_end);

-- ─── Entitlements ───────────────────────────────────────────────────────────

-- Current entitlement state per (app, external_uid). This is what
-- GET /v1/entitlements returns and what the entitlement.updated webhook carries.
-- One row per (app_id, external_uid) — upserted on each grant.
CREATE TABLE IF NOT EXISTS entitlements (
    id              TEXT PRIMARY KEY,           -- ent_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    external_uid    TEXT NOT NULL,
    customer_id     TEXT REFERENCES customers(id),
    subscription_id TEXT REFERENCES subscriptions(id),
    tier            TEXT NOT NULL,               -- 'member' | 'free' | ...
    status          TEXT NOT NULL DEFAULT 'active', -- active | expired | revoked
    expires_at      TEXT,                        -- null = non-expiring
    -- Monotonic version so consumers can ignore stale webhook deliveries.
    version         INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(app_id, external_uid)
);
CREATE INDEX IF NOT EXISTS idx_ent_app_uid ON entitlements(app_id, external_uid);

-- Immutable audit log of every grant applied (entitlement transitions).
CREATE TABLE IF NOT EXISTS grants (
    id              TEXT PRIMARY KEY,           -- grant_xxx
    entitlement_id  TEXT NOT NULL REFERENCES entitlements(id),
    app_id          TEXT NOT NULL REFERENCES apps(id),
    external_uid    TEXT NOT NULL,
    transaction_id  TEXT REFERENCES transactions(id),
    subscription_id TEXT REFERENCES subscriptions(id),
    tier            TEXT NOT NULL,
    -- granted | renewed | revoked | expired
    action          TEXT NOT NULL DEFAULT 'granted',
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grants_ent ON grants(entitlement_id);

-- ─── Outbound webhooks (Elixpo Pay -> consuming app) ────────────────────────

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id              TEXT PRIMARY KEY,           -- whe_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    url             TEXT NOT NULL,
    -- HMAC signing secret ref (env var name in P0).
    secret_ref      TEXT NOT NULL,
    -- JSON array of subscribed event types, e.g. ["entitlement.updated"].
    events          TEXT NOT NULL DEFAULT '["entitlement.updated"]',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whe_app ON webhook_endpoints(app_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              TEXT PRIMARY KEY,           -- whd_xxx
    endpoint_id     TEXT NOT NULL REFERENCES webhook_endpoints(id),
    app_id          TEXT NOT NULL REFERENCES apps(id),
    event_type      TEXT NOT NULL,
    payload         TEXT NOT NULL,               -- JSON body sent
    -- pending | delivered | failed
    status          TEXT NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    response_status INTEGER,
    response_body   TEXT,
    last_attempt_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whd_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_whd_status ON webhook_deliveries(status);

-- ─── Inbound provider webhooks (replay/idempotency guard) ──────────────────

CREATE TABLE IF NOT EXISTS provider_webhook_events (
    id              TEXT PRIMARY KEY,           -- pwe_xxx (our id)
    provider        TEXT NOT NULL,
    -- Provider's event id (Razorpay x-razorpay-event-id) — UNIQUE => replay-safe.
    provider_event_id TEXT,
    event_type      TEXT,
    -- received | processed | ignored | error
    status          TEXT NOT NULL DEFAULT 'received',
    payload         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pwe_provider_event
    ON provider_webhook_events(provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

-- ─── Ledger (double-entry; minimal in P0, the discipline starts now) ───────

-- Every captured charge writes balanced entries. P0 keeps it simple:
-- a credit to platform revenue and a debit to the customer's paid balance.
-- P1 expands into wallets / payouts / pool splits off this same table.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              TEXT PRIMARY KEY,           -- le_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    transaction_id  TEXT REFERENCES transactions(id),
    -- Logical account, e.g. 'platform_revenue', 'customer_paid', 'provider_fee'.
    account         TEXT NOT NULL,
    direction       TEXT NOT NULL,               -- 'debit' | 'credit'
    currency        TEXT NOT NULL,
    amount          INTEGER NOT NULL,            -- minor units, always positive
    -- Groups the entries of one balanced transaction together.
    group_id        TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_txn ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_group ON ledger_entries(group_id);

-- ─── Refunds (schema only in P0; not wired until P1) ───────────────────────

CREATE TABLE IF NOT EXISTS refunds (
    id              TEXT PRIMARY KEY,           -- rfnd_xxx
    transaction_id  TEXT NOT NULL REFERENCES transactions(id),
    app_id          TEXT NOT NULL REFERENCES apps(id),
    provider        TEXT NOT NULL,
    provider_refund_id TEXT,
    currency        TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'created',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refunds_txn ON refunds(transaction_id);
