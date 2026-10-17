-- Server-unique username (handle), separate from the non-unique display_name.
-- Stored lowercase (canonical) so uniqueness is effectively case-insensitive.
-- The user `id` (UUID) remains the stable identifier; the username can change.
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN username_changed_at DATETIME;
ALTER TABLE users ADD COLUMN username_change_count INTEGER DEFAULT 0;

-- Unique handle. SQLite treats multiple NULLs as distinct, so existing rows
-- (username NULL until the user picks one on next sign-in) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
