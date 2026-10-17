-- Per-app webhook signing secret (Stripe-style whsec_). Each merchant verifies
-- their own entitlement.updated webhooks with this, replacing the global
-- ELIXPO_PAY_WEBHOOK_SECRET. Generated when a webhook endpoint is created and
-- shown in the merchant dashboard.
ALTER TABLE webhook_endpoints ADD COLUMN signing_secret TEXT;
