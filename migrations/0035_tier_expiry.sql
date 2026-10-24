-- Membership expiry, written by the Elixpo Pay grant webhook (entitlement.updated).
-- Unix milliseconds. NULL = non-expiring or no active membership.
ALTER TABLE users ADD COLUMN tier_expires_at INTEGER;
