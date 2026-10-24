-- Add display name support to users table
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN display_name_changed_at DATETIME;
ALTER TABLE users ADD COLUMN display_name_change_count INTEGER DEFAULT 0;
