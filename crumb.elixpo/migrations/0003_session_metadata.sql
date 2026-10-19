ALTER TABLE sessions ADD COLUMN public_id TEXT;
ALTER TABLE sessions ADD COLUMN created_at INTEGER;
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

UPDATE sessions
SET public_id = lower(hex(randomblob(16))),
    created_at = unixepoch(),
    last_seen_at = unixepoch()
WHERE public_id IS NULL;

CREATE UNIQUE INDEX sessions_public_id ON sessions(public_id);
CREATE INDEX sessions_user_activity ON sessions(user_id, last_seen_at DESC);
