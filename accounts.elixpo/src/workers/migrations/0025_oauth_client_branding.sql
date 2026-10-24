-- Verified OAuth client branding.

ALTER TABLE oauth_clients ADD COLUMN branding_display_name TEXT;
ALTER TABLE oauth_clients ADD COLUMN branding_primary_color TEXT;
ALTER TABLE oauth_clients ADD COLUMN branding_accent_color TEXT;
ALTER TABLE oauth_clients ADD COLUMN privacy_policy_url TEXT;
ALTER TABLE oauth_clients ADD COLUMN terms_of_service_url TEXT;
ALTER TABLE oauth_clients ADD COLUMN is_branding_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oauth_clients ADD COLUMN branding_verified_domain TEXT;
ALTER TABLE oauth_clients ADD COLUMN branding_verified_at DATETIME;
