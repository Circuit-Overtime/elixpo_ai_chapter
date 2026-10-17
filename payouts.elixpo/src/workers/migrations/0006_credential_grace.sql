-- Credential rotation with a grace window. When a merchant rotates a secret or
-- changes a client id, the previous value keeps working until its expiry so the
-- vendor can redeploy without downtime. A NULL expiry (or past expiry) means the
-- previous value is dead.
--
--   apps.prev_slug / prev_slug_expires_at                  — old client_id (slug)
--   apps.prev_api_key_hash / prev_api_key_expires_at       — old secret key hash
--   webhook_endpoints.prev_signing_secret / …_expires_at   — old whsec_ (dual-sign)

ALTER TABLE apps ADD COLUMN prev_slug TEXT;
ALTER TABLE apps ADD COLUMN prev_slug_expires_at TEXT;
ALTER TABLE apps ADD COLUMN prev_api_key_hash TEXT;
ALTER TABLE apps ADD COLUMN prev_api_key_expires_at TEXT;

ALTER TABLE webhook_endpoints ADD COLUMN prev_signing_secret TEXT;
ALTER TABLE webhook_endpoints ADD COLUMN prev_signing_secret_expires_at TEXT;
