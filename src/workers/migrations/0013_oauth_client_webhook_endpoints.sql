-- 0013_oauth_client_webhook_endpoints.sql
--
-- Move from one webhook per OAuth app (single columns on oauth_clients) to
-- many endpoints per app. An "endpoint" is a single URL + its own secret +
-- its own event subscription. The dispatcher fans out one POST per active
-- endpoint when an event fires.
--
-- Backfill rule: every oauth_clients row that currently has a webhook_url
-- becomes one row here, using id = client_id. This keeps legacy KV keys
-- (`webhook_secret:<client_id>`) valid because the dispatcher looks up
-- `webhook_secret:<endpoint_id>` and for backfilled rows the two are equal.
-- New endpoints created post-migration use random UUIDs.
--
-- The old oauth_clients.webhook_* columns are LEFT IN PLACE. We stop
-- reading from them but don't drop them — keeps the migration reversible
-- and avoids breaking any first-party code still on the old path during
-- the rollout window.

CREATE TABLE IF NOT EXISTS oauth_client_webhook_endpoints (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    url TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    label TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    secret_set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_delivery_at DATETIME,
    last_status_code INTEGER,
    last_error TEXT,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_endpoints_client
    ON oauth_client_webhook_endpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_endpoints_active
    ON oauth_client_webhook_endpoints(client_id, is_active);

-- Backfill: collapse each legacy oauth_clients.webhook_url into one
-- endpoint row. INSERT OR IGNORE keeps the migration idempotent if it
-- gets partially applied.
INSERT OR IGNORE INTO oauth_client_webhook_endpoints
    (id, client_id, url, secret_hash, events, is_active, label, created_at, secret_set_at, last_delivery_at)
SELECT
    client_id,
    client_id,
    webhook_url,
    webhook_secret_hash,
    COALESCE(webhook_events, '[]'),
    1,
    'default',
    COALESCE(webhook_secret_set_at, CURRENT_TIMESTAMP),
    COALESCE(webhook_secret_set_at, CURRENT_TIMESTAMP),
    webhook_last_delivery_at
FROM oauth_clients
WHERE webhook_url IS NOT NULL
  AND webhook_secret_hash IS NOT NULL;

-- User-scoped webhooks now point at a specific endpoint, not a whole app.
-- An app with multiple endpoints needs the user to pick which one to
-- target. The url/secret columns on `webhooks` become a denormalized
-- snapshot of the endpoint at create time — POSTs go to the endpoint's
-- live URL/secret resolved through the endpoints table.
ALTER TABLE webhooks ADD COLUMN endpoint_id TEXT
    REFERENCES oauth_client_webhook_endpoints(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_webhooks_endpoint_id ON webhooks(endpoint_id);
