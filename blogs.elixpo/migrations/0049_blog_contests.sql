-- Time-bound writing contests. Submitted blogs remain owned by their authors;
-- the snapshot is the immutable judging artefact captured at submission time.
CREATE TABLE IF NOT EXISTS contests (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  problem_statement TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  template_content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'live', 'judging', 'completed', 'cancelled')),
  starts_at INTEGER NOT NULL,
  submissions_close_at INTEGER NOT NULL,
  judging_closes_at INTEGER NOT NULL,
  results_at INTEGER,
  required_topics TEXT NOT NULL DEFAULT '[]',
  allowed_targets TEXT NOT NULL DEFAULT '["personal"]',
  eligibility TEXT NOT NULL DEFAULT '{}',
  per_author_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_author_limit BETWEEN 1 AND 10),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  CHECK (starts_at < submissions_close_at),
  CHECK (submissions_close_at <= judging_closes_at)
);

CREATE INDEX IF NOT EXISTS idx_contests_status_dates
  ON contests(status, starts_at, submissions_close_at, judging_closes_at);
CREATE INDEX IF NOT EXISTS idx_contests_organizer
  ON contests(organizer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS contest_members (
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('moderator', 'judge')),
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS contest_submissions (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  -- Deliberately not a foreign key: deleting the live blog must not erase the
  -- frozen judging artefact or finalized contest history.
  blog_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  snapshot_content TEXT NOT NULL,
  snapshot_metadata TEXT NOT NULL,
  blog_updated_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  withdrawn_at INTEGER,
  UNIQUE (contest_id, blog_id)
);

CREATE INDEX IF NOT EXISTS idx_contest_submissions_gallery
  ON contest_submissions(contest_id, withdrawn_at, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_submissions_author
  ON contest_submissions(contest_id, author_id, withdrawn_at);

CREATE TABLE IF NOT EXISTS contest_awards (
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES contest_submissions(id) ON DELETE CASCADE,
  placement TEXT NOT NULL CHECK (placement IN ('winner', 'runner-up', 'honorable-mention')),
  position INTEGER NOT NULL DEFAULT 1,
  awarded_by TEXT NOT NULL REFERENCES users(id),
  awarded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (contest_id, placement, position),
  UNIQUE (contest_id, submission_id)
);

CREATE TABLE IF NOT EXISTS contest_audit_log (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_contest_audit
  ON contest_audit_log(contest_id, created_at DESC);
