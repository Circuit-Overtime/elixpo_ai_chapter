-- Per-client scope descriptions for third-party products.
ALTER TABLE oauth_clients ADD COLUMN custom_scopes TEXT NOT NULL DEFAULT '[]';

INSERT INTO users (id, email, email_verified, is_active)
VALUES ('system-lixrl-cli', 'system-cli@lixrl.internal', 1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO oauth_clients (
    client_id, name, client_type, client_secret_hash, owner_id,
    audience, redirect_uris, scopes, custom_scopes
) VALUES (
    'lixrl-cli-prod', 'Lixrl CLI', 'public',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'system-lixrl-cli', 'lixrl.com', '[]',
    '["openid","profile","email","lixrl:keys:create"]', '[]'
)
ON CONFLICT (client_id) DO UPDATE SET
    name = excluded.name,
    client_type = 'public',
    audience = excluded.audience,
    redirect_uris = excluded.redirect_uris,
    scopes = excluded.scopes,
    custom_scopes = excluded.custom_scopes;
