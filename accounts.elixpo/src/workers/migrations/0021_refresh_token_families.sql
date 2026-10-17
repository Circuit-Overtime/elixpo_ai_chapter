-- Add refresh token family tracking and revocation reasons
ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN parent_token_hash TEXT;
ALTER TABLE refresh_tokens ADD COLUMN sid TEXT;
ALTER TABLE refresh_tokens ADD COLUMN revoked_reason TEXT;

-- Add indexes for efficient lookups during rotation and revocation
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE UNIQUE INDEX idx_refresh_tokens_parent_hash ON refresh_tokens(parent_token_hash);
CREATE INDEX idx_refresh_tokens_sid ON refresh_tokens(sid);
