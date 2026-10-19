-- Custom links for org pages: up to 5 named anchors per org (name + url).
CREATE TABLE IF NOT EXISTS org_links (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,           -- 0..4, display order
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (org_id, position)
);

CREATE INDEX IF NOT EXISTS idx_org_links_org ON org_links(org_id);
