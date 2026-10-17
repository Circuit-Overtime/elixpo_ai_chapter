-- 0017_app_usage_mau.sql
--
-- Per-app monthly active user (MAU) tracking.
--
-- Counts unique (client_id, user_id, year_month) tuples — a user is "active"
-- on an OAuth app in a given calendar month if they completed at least one
-- successful OAuth authorization or token exchange for that app in that
-- month. We record exactly once per (app, user, month) so the counter is a
-- true unique count, not an aggregation of token events.
--
-- Schema:
--   app_usage_monthly        per (client_id, year_month) running total
--   app_usage_seen           per (client_id, user_id, year_month) marker
--                            for the dedupe — UNIQUE index drives once-only
--                            increment semantics.
--
-- The /pricing tier limits use these counters to gate over-limit usage:
--   hobby   1,000 MAU per app
--   indie   10,000 MAU per app
--   studio  100,000 MAU per app
--
-- Soft-warning at 80%, hard-block authorization at 200% (gives indies a
-- grace ceiling above their tier so they don't bounce traffic during a
-- legitimate burst).

CREATE TABLE IF NOT EXISTS app_usage_seen (
    -- The OAuth app (client_id is the public slug used everywhere else).
    client_id   TEXT NOT NULL,
    -- The active user — the accounts.elixpo user id, not their email.
    user_id     TEXT NOT NULL,
    -- 'YYYY-MM' — calendar month in UTC. Indexes well + queries cheaply.
    year_month  TEXT NOT NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_app_usage_seen_app_month
    ON app_usage_seen(client_id, year_month);

CREATE TABLE IF NOT EXISTS app_usage_monthly (
    client_id   TEXT NOT NULL,
    year_month  TEXT NOT NULL,
    mau_count   INTEGER NOT NULL DEFAULT 0,
    last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_app_usage_monthly_app
    ON app_usage_monthly(client_id);
