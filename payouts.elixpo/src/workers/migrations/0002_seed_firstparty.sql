-- P0 first-party seed: merchant = Elixpo, app = lixblogs (blogs.elixpo).
-- Idempotent (INSERT OR IGNORE on stable ids). Safe to re-apply.

-- Merchant: Elixpo
INSERT OR IGNORE INTO merchants (id, name, email, status)
VALUES ('mer_elixpo', 'Elixpo', 'hello@elixpo.com', 'active');

-- App: blogs.elixpo (slug 'lixblogs').
-- api_key_hash = SHA-256 of ELIXPO_PAY_API_KEY (the value lives only in env).
INSERT OR IGNORE INTO apps (id, merchant_id, slug, name, api_key_hash, return_url, status)
VALUES (
    'app_lixblogs',
    'mer_elixpo',
    'lixblogs',
    'Elixpo Blogs',
    '3c71e64209c53ce5ba2ab362af72216acf9827c26aaab0ca8265997d85a808c5',
    'https://blogs.elixpo.com/pricing',
    'active'
);

-- Razorpay connection (keys read from server env in P0).
INSERT OR IGNORE INTO provider_connections (id, app_id, provider, mode, secret_ref, status)
VALUES ('pc_lixblogs_rzp', 'app_lixblogs', 'razorpay', 'env', 'RAZORPAY_KEY_SECRET', 'active');

-- Product: Blogs Member -> grants tier 'member'.
INSERT OR IGNORE INTO products (id, app_id, name, tier, description, active)
VALUES ('prod_blogs_member', 'app_lixblogs', 'Blogs Member', 'member',
        'Member-only reads, higher limits, and creator pool eligibility.', 1);

-- Prices (one-time, 30-day grant). INR default + USD fallback.
INSERT OR IGNORE INTO prices
    (id, product_id, currency, unit_amount, type, interval, interval_count, region, provider, active)
VALUES
    ('price_blogs_member_inr', 'prod_blogs_member', 'INR', 19900, 'one_time', 'month', 1, 'IN', 'razorpay', 1),
    ('price_blogs_member_usd', 'prod_blogs_member', 'USD',   500, 'one_time', 'month', 1, NULL, 'razorpay', 1);

-- Outbound webhook endpoint: blogs grant receiver.
-- secret_ref names the env var holding the HMAC signing secret.
INSERT OR IGNORE INTO webhook_endpoints (id, app_id, url, secret_ref, events, status)
VALUES (
    'whe_lixblogs_grant',
    'app_lixblogs',
    'https://blogs.elixpo.com/api/billing/grant',
    'ELIXPO_PAY_WEBHOOK_SECRET',
    '["entitlement.updated"]',
    'active'
);
