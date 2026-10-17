-- Branding thresholds and per-app activity filter refresh tokens by client.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id
    ON refresh_tokens(client_id);
