-- Account status: active (default), disabled (self-deactivated), removed (permanently deleted)
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
