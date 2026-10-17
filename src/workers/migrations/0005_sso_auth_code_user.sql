-- Migration 0005: Add code, user_id, used columns to auth_requests for SSO flow

ALTER TABLE auth_requests ADD COLUMN code TEXT;
ALTER TABLE auth_requests ADD COLUMN user_id TEXT;
ALTER TABLE auth_requests ADD COLUMN used INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_auth_requests_code ON auth_requests(code);
CREATE INDEX IF NOT EXISTS idx_auth_requests_user_id ON auth_requests(user_id);
