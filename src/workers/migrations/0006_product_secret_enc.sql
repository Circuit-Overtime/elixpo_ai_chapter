-- mail.elixpo — store the product shared secret reversibly (for HMAC signing).
--
-- The inbound trigger (/v1/hooks/:key) moves from Bearer-token auth to
-- Stripe-style HMAC request signing. Verifying a signature requires the server
-- to hold the RAW secret to recompute the HMAC — a sha256 hash alone can't do
-- that. So we keep a second representation of the secret: AES-256-GCM encrypted
-- at rest (same scheme as sender app passwords), recoverable only with
-- ELIXPO_MAIL_ENCRYPTION_KEY.
--
-- secret_hash / prev_secret_hash stay (still written) for defense in depth and
-- possible future Bearer fallback; secret_enc / prev_secret_enc are what the
-- signature verifier uses. Existing products predating this migration have a
-- NULL secret_enc — rotating their secret populates it.

ALTER TABLE products ADD COLUMN secret_enc TEXT;
ALTER TABLE products ADD COLUMN prev_secret_enc TEXT;
