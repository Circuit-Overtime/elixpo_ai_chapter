-- 0016_user_tier_billing.sql
--
-- Pricing tiers + billing state on the user row.
--
-- accounts.elixpo is a consuming app of payouts.elixpo. Each user's
-- entitlement state is the source of truth on the Pay side; we mirror it on
-- the user row so dashboard/api gates can read tier without round-tripping
-- to Pay on every request. The `entitlement.updated` inbound webhook from
-- payouts.elixpo keeps these columns in sync.
--
-- Schema:
--   tier                       'hobby' | 'indie' | 'studio' | 'internal'
--   tier_renews_at             ISO-8601 timestamp; NULL for hobby/internal.
--   tier_provider_subscription_id  Razorpay subscription id from Pay, NULL
--                                  while user is on hobby. Lets us correlate
--                                  inbound webhook → user row.
--   is_internal                Bypass billing entirely (admin/team accounts).
--                              Set out-of-band via SQL/cli, never via API.
--                              Internal users are treated like Studio for
--                              feature gating but don't show billing UI.

ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'hobby';
ALTER TABLE users ADD COLUMN tier_renews_at DATETIME;
ALTER TABLE users ADD COLUMN tier_provider_subscription_id TEXT;
ALTER TABLE users ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_tier_provider_sub
    ON users(tier_provider_subscription_id);

-- Audit log of every entitlement.updated event we receive. Replay-safe
-- (events are deduped on provider_event_id) and gives us a trail for
-- billing disputes / refund decisions.
CREATE TABLE IF NOT EXISTS billing_events (
    id                          TEXT PRIMARY KEY,
    user_id                     TEXT REFERENCES users(id),
    -- The unique event id from the payouts.elixpo webhook envelope.
    provider_event_id           TEXT,
    -- 'entitlement.updated' for v1; future-proofed for other event types.
    event_type                  TEXT NOT NULL,
    -- Tier and status snapshot at the time of the event.
    tier                        TEXT,
    active                      INTEGER,
    expires_at                  DATETIME,
    provider_subscription_id    TEXT,
    payload                     TEXT,
    received_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_event_id
    ON billing_events(provider_event_id)
    WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_user
    ON billing_events(user_id);
