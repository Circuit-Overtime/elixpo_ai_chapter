-- 0014_mfa_and_trusted_devices.sql
--
-- Multi-factor auth + trusted-device tracking.
--
-- A user can enroll multiple factors of different kinds. Each row in
-- user_mfa_factors is one enrolled credential — TOTP secret, passkey
-- credential, or an "email_otp enabled" toggle. confirmed_at = NULL means
-- enrollment is in progress and the factor cannot be used yet.
--
-- Backup codes are stored hashed; the plaintext is shown to the user
-- exactly once at enable-time (or regeneration). Each code is single-use:
-- used_at flips to a timestamp when consumed.
--
-- Trusted devices live in their own table so the user can review and
-- revoke them. The signed cookie on the client carries device_uuid +
-- user_id; the row carries the metadata + last-seen + revoke flag.
--
-- users.mfa_enabled is the single source of truth for "2FA enforced on
-- this account". A user can enroll factors without enabling MFA (e.g.
-- mid-setup); enforcement only applies when the flag is 1.

CREATE TABLE IF NOT EXISTS user_mfa_factors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('passkey', 'totp', 'email_otp')),
    name TEXT,
    -- TOTP: base32 secret; passkey: COSE public key (b64url). Unused for email_otp.
    secret TEXT,
    -- Passkey credential id (b64url). Unique across the whole table.
    credential_id TEXT,
    -- Passkey signature counter to detect cloned authenticators.
    sign_count INTEGER NOT NULL DEFAULT 0,
    -- Passkey: JSON array of declared transports (usb, ble, nfc, internal, hybrid).
    transports TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    last_used_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_factors_user
    ON user_mfa_factors(user_id);
-- Partial unique index so two users can't share a credential_id and so
-- WebAuthn lookups (by raw credential bytes during assertion) are O(1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mfa_factors_credential
    ON user_mfa_factors(credential_id)
    WHERE credential_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_mfa_backup_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_backup_codes_user
    ON user_mfa_backup_codes(user_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    -- Client-side UUID stored in the signed trusted_device cookie. We
    -- check the cookie's UUID against this column, not against id, so
    -- rotating the row's internal id is cheap.
    device_uuid TEXT NOT NULL,
    name TEXT,
    -- Privacy-friendly fingerprint: hash of the IP that enrolled the
    -- device, plus a short human-readable UA summary ("Chrome on macOS").
    ip_hash TEXT,
    ua_short TEXT,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- A user can have many devices; the cookie's device_uuid uniquely
-- identifies one within the user's set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_uuid
    ON trusted_devices(user_id, device_uuid);

ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
