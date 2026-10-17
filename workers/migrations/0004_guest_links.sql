-- Anonymous one-click links. Guest links are deliberately separate from
-- account-owned URLs: they have no analytics and always expire after 24h.
CREATE TABLE IF NOT EXISTS guest_links (
  short_code TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guest_links_expires_at
  ON guest_links(expires_at);

-- D1 is the source of truth for the guest quota. One row per derived guest
-- identity makes the 24-hour claim atomic even under concurrent requests.
CREATE TABLE IF NOT EXISTS guest_quotas (
  fingerprint_hash TEXT PRIMARY KEY,
  available_at TEXT NOT NULL,
  last_risk_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guest_quotas_available_at
  ON guest_quotas(available_at);
