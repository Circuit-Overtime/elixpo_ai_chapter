-- Billing / entitlement state synced from Elixpo Pay's entitlement.updated
-- webhook. `tier` already exists on users; these track the subscription
-- behind a paid tier so we can show renewal/status and expire access on lapse.
ALTER TABLE users ADD COLUMN tier_expires_at TEXT;
ALTER TABLE users ADD COLUMN pay_subscription_id TEXT;
ALTER TABLE users ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_users_pay_subscription_id ON users(pay_subscription_id);
