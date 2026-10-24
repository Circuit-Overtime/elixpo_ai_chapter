-- Migration 0002: Add missing columns and tables to existing schema

-- Columns role and is_admin already exist in users table (added manually)

-- Recreate oauth_clients table with all columns
-- First, create a new table with the correct schema
CREATE TABLE IF NOT EXISTS oauth_clients_new (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL, 
  scopes TEXT NOT NULL, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1,
  owner_id TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  request_count INTEGER DEFAULT 0,
  last_used DATETIME,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Copy data from old table if it exists and has data
INSERT INTO oauth_clients_new (client_id, client_secret_hash, name, redirect_uris, scopes, created_at, is_active, owner_id)
SELECT client_id, client_secret_hash, name, redirect_uris, scopes, created_at, is_active, client_id
FROM oauth_clients
WHERE client_id IN (SELECT client_id FROM oauth_clients LIMIT 0);

-- Drop old table
DROP TABLE IF EXISTS oauth_clients;

-- Rename new table
ALTER TABLE oauth_clients_new RENAME TO oauth_clients;

-- Create missing tables if they don't exist
CREATE TABLE IF NOT EXISTS app_stats (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  date DATE NOT NULL,
  requests INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  UNIQUE(client_id, date)
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  changes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  window_reset_at DATETIME NOT NULL,
  is_blocked BOOLEAN DEFAULT 0,
  blocked_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ip_address, endpoint)
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_identities_user_id ON identities(user_id);
CREATE INDEX IF NOT EXISTS idx_identities_provider_id ON identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(verification_token);
CREATE INDEX IF NOT EXISTS idx_email_verification_otp ON email_verification_tokens(otp_code);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_requests_state ON auth_requests(state);
CREATE INDEX IF NOT EXISTS idx_auth_requests_expires ON auth_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON rate_limits(ip_address, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_reset ON rate_limits(window_reset_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked_until ON rate_limits(blocked_until);
CREATE INDEX IF NOT EXISTS idx_rate_limits_is_blocked ON rate_limits(is_blocked);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_owner ON oauth_clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_app_stats_client ON app_stats(client_id, date);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin, created_at);
