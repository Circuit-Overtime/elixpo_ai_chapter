-- 0018_users_tier_cancelled_at.sql
--
-- Tracks when a buyer's autopay subscription was cancelled — separate
-- from `tier` because graceful cancel keeps the user on their paid tier
-- through `tier_renews_at`. The dashboard reads this to render the
-- right UI:
--   * tier_cancelled_at IS NULL          → "Active" + Cancel button
--   * tier_cancelled_at IS NOT NULL      → "Cancelled · access until X"
--                                          (no Cancel button, no nag)
--   * tier flips to hobby at period_end  → reset to NULL (handled by
--                                          applyEntitlementUpdate when
--                                          previousTier→hobby transition
--                                          fires the final
--                                          entitlement.updated)
--
-- Cleared when a user starts a NEW paid subscription so the cancelled
-- state doesn't persist across cycles.

ALTER TABLE users ADD COLUMN tier_cancelled_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_tier_cancelled_at
    ON users(tier_cancelled_at)
    WHERE tier_cancelled_at IS NOT NULL;
