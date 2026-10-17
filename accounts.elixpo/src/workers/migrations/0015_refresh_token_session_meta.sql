-- 0015_refresh_token_session_meta.sql
--
-- Per-session device metadata on refresh_tokens. Without this, the
-- /dashboard/security "Active sessions" list can't tell the user
-- anything about each signed-in device beyond "exists" — no device
-- name, no last-seen time, no way to spot the suspicious one.
--
-- Privacy: IPs are hashed (SHA-256 truncated, matches the
-- trusted_devices convention). UA strings are summarised
-- ("Chrome on macOS") rather than stored raw.
--
-- All three columns are nullable so existing rows survive the migration
-- with NULL metadata — the UI just renders "Unknown device" for those.

ALTER TABLE refresh_tokens ADD COLUMN ip_hash TEXT;
ALTER TABLE refresh_tokens ADD COLUMN ua_short TEXT;
ALTER TABLE refresh_tokens ADD COLUMN last_used_at DATETIME;
