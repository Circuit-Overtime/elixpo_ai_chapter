-- User-scoped webhooks: tie each webhook to a specific OAuth app the user
-- owns. We previously allowed free-text Payload URLs, which is an SSRF /
-- abuse vector — a user could point a webhook at an internal IP, a third-
-- party site to spam, etc. From this migration on, the create flow takes
-- an oauth_clients.client_id; the URL is resolved server-side from that
-- app's webhook_url, so only URLs the developer explicitly registered are
-- ever fired by us.
--
-- The column is nullable for backward compatibility with rows created
-- before this migration. New rows will always have it set.

ALTER TABLE webhooks ADD COLUMN client_id TEXT;

-- Helper index for the dispatcher / dashboard list panel that joins back
-- to oauth_clients for an app name.
CREATE INDEX IF NOT EXISTS idx_webhooks_client_id ON webhooks(client_id);
