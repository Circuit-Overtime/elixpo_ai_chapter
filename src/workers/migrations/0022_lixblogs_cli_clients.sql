-- Add audience column to clients
ALTER TABLE oauth_clients ADD COLUMN audience TEXT;

-- Create system user to satisfy oauth_clients.owner_id FK
INSERT INTO users (id, email, email_verified, is_active)
VALUES ('system-lixblogs-cli', 'system-cli@lixblogs.internal', 1, 0)
ON CONFLICT (id) DO NOTHING;

-- Seed public CLI clients
INSERT INTO oauth_clients (
    client_id, name, client_type, client_secret_hash, owner_id,
    audience, redirect_uris, scopes
) VALUES
('lixblogs-cli-dev', 'LixBlogs CLI (Dev)', 'public', '0000000000000000000000000000000000000000000000000000000000000000', 'system-lixblogs-cli', 'api-dev.lixblogs.com', '[]', '["openid","profile","email","lixblogs:profile:read","lixblogs:profile:write","lixblogs:blog:read","lixblogs:blog:write","lixblogs:blog:publish","lixblogs:blog:delete","lixblogs:media:read","lixblogs:media:write","lixblogs:organizations:read","lixblogs:organizations:write","lixblogs:collaboration:read","lixblogs:collaboration:write","lixblogs:analytics:read","lixblogs:notifications:read"]'),
('lixblogs-cli-staging', 'LixBlogs CLI (Staging)', 'public', '0000000000000000000000000000000000000000000000000000000000000000', 'system-lixblogs-cli', 'api-staging.lixblogs.com', '[]', '["openid","profile","email","lixblogs:profile:read","lixblogs:profile:write","lixblogs:blog:read","lixblogs:blog:write","lixblogs:blog:publish","lixblogs:blog:delete","lixblogs:media:read","lixblogs:media:write","lixblogs:organizations:read","lixblogs:organizations:write","lixblogs:collaboration:read","lixblogs:collaboration:write","lixblogs:analytics:read","lixblogs:notifications:read"]'),
('lixblogs-cli-prod', 'LixBlogs CLI (Prod)', 'public', '0000000000000000000000000000000000000000000000000000000000000000', 'system-lixblogs-cli', 'api.lixblogs.com', '[]', '["openid","profile","email","lixblogs:profile:read","lixblogs:profile:write","lixblogs:blog:read","lixblogs:blog:write","lixblogs:blog:publish","lixblogs:blog:delete","lixblogs:media:read","lixblogs:media:write","lixblogs:organizations:read","lixblogs:organizations:write","lixblogs:collaboration:read","lixblogs:collaboration:write","lixblogs:analytics:read","lixblogs:notifications:read"]');
