-- A compact public designation shown with an organization's name. This stays
-- separate from the longer description and Markdown-capable bio.
ALTER TABLE orgs ADD COLUMN tagline TEXT NOT NULL DEFAULT ''
  CHECK (length(tagline) <= 100);
