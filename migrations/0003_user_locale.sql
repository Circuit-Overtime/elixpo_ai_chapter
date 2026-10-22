-- Add locale and avatar_url to users for OAuth profile data
ALTER TABLE users ADD COLUMN locale TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN avatar_url TEXT;
