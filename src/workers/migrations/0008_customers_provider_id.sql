-- 0008_customers_provider_id.sql
--
-- Cache the Razorpay customer id per local customer.
--
-- Razorpay's Subscriptions API works without a pre-created `customer_id`,
-- but the buyer flow degrades on UPI Autopay specifically — the hosted
-- mandate page can't generate a valid UPI Intent without a customer
-- bound to the subscription, so the QR loops on "Refresh QR" and never
-- resolves to a mandate.
--
-- Lazy-creation: on the first autopay checkout for a given customer we
-- POST /v1/customers to Razorpay, persist the returned `cust_…` id here,
-- and reuse it for every subsequent subscription create. One Razorpay
-- customer per (app, external_uid).

ALTER TABLE customers ADD COLUMN provider_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_provider_id
    ON customers(provider_customer_id);
