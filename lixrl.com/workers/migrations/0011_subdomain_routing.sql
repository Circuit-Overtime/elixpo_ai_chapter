-- Paid, platform-owned one-level subdomains (for example acme.lixrl.com).
-- Removed claims remain as history but no longer block a fresh, verified claim.
CREATE TABLE subdomains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL COLLATE NOCASE,
  hostname TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'verified', 'active', 'failed', 'suspended', 'removed')),
  verification_token TEXT NOT NULL UNIQUE,
  verification_expires_at TEXT NOT NULL,
  verified_at TEXT,
  activated_at TEXT,
  removed_at TEXT,
  last_error TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_subdomains_live_hostname
  ON subdomains(hostname)
  WHERE status != 'removed';
CREATE UNIQUE INDEX idx_subdomains_user_default
  ON subdomains(user_id)
  WHERE is_default = 1 AND status = 'active';
CREATE INDEX idx_subdomains_user_status ON subdomains(user_id, status);
CREATE INDEX idx_subdomains_label_status ON subdomains(label, status);

-- A link keeps its canonical lixrl.com short code. A domain mapping can use a
-- different code, allowing the same branded code on separate subdomains.
CREATE TABLE subdomain_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subdomain_id INTEGER NOT NULL,
  url_id INTEGER NOT NULL,
  short_code TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE CASCADE,
  FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
  UNIQUE(subdomain_id, short_code),
  UNIQUE(subdomain_id, url_id)
);

CREATE INDEX idx_subdomain_links_lookup
  ON subdomain_links(subdomain_id, short_code);
CREATE INDEX idx_subdomain_links_url ON subdomain_links(url_id);
