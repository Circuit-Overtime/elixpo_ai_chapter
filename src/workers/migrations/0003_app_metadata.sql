-- Richer app registration metadata. The slug stays the immutable API identifier
-- (used in the checkout handoff `app=`, /v1/entitlements, and webhook payloads);
-- these add the human-facing details a merchant supplies at registration.
ALTER TABLE apps ADD COLUMN description TEXT;
ALTER TABLE apps ADD COLUMN homepage_url TEXT;
ALTER TABLE apps ADD COLUMN pricing_url TEXT;
