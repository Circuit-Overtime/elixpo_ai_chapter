-- App-scoped webhook subscriptions on OAuth clients.
--
-- The existing `webhooks` table is user-scoped (a user can manually add
-- webhook URLs to receive events about their OWN data). This migration adds
-- a parallel app-scoped channel: an OAuth app (e.g. ElixpoURL) declares a
-- webhook URL at registration time and receives signed events for any user
-- who has authorized the app.
--
-- Per-app fields:
--   webhook_url           — receiver endpoint (https only in prod)
--   webhook_secret_hash   — SHA-256 of the plaintext secret. Plaintext
--                            is returned to the developer exactly once
--                            (on registration / rotation) and never stored
--   webhook_events        — JSON array of event types the app subscribes
--                            to. Empty/null means webhook is disabled.
--   webhook_last_delivery_at — timestamp of last successful POST
--   webhook_secret_set_at — when the current secret was minted, used by
--                            the rotation flow

ALTER TABLE oauth_clients ADD COLUMN webhook_url TEXT;
ALTER TABLE oauth_clients ADD COLUMN webhook_secret_hash TEXT;
ALTER TABLE oauth_clients ADD COLUMN webhook_events TEXT;
ALTER TABLE oauth_clients ADD COLUMN webhook_last_delivery_at DATETIME;
ALTER TABLE oauth_clients ADD COLUMN webhook_secret_set_at DATETIME;

-- Helper index for dispatcher fan-out lookups.
CREATE INDEX IF NOT EXISTS idx_oauth_clients_webhook_active
    ON oauth_clients(is_active)
    WHERE webhook_url IS NOT NULL;
