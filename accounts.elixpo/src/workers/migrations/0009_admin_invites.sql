-- Admin invite tokens
CREATE TABLE IF NOT EXISTS admin_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  accepted INTEGER DEFAULT 0,
  accepted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_token ON admin_invites(token);
CREATE INDEX IF NOT EXISTS idx_admin_invites_email ON admin_invites(email);
