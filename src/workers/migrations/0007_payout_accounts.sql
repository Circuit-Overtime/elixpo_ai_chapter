-- Connected payout accounts (Razorpay Route).
--
-- Each merchant connects their own bank account so their app's revenue is split
-- to them at payment time (Razorpay Route → a linked sub-account, acc_xxx, KYC'd
-- under the Elixpo platform), minus a platform commission. Foundation stage:
-- this stores the connection + commission and shows status; the live Razorpay
-- `transfers`/linked-account wiring is added in a follow-up. One per merchant.
CREATE TABLE IF NOT EXISTS payout_accounts (
    id                  TEXT PRIMARY KEY,            -- pa_xxx
    merchant_id         TEXT NOT NULL UNIQUE REFERENCES merchants(id),
    provider            TEXT NOT NULL DEFAULT 'razorpay',
    -- Razorpay linked account id (acc_xxx) once the bank is onboarded on Razorpay.
    razorpay_account_id TEXT,
    beneficiary_name    TEXT,                        -- account holder name
    bank_ifsc           TEXT,                        -- IFSC (display)
    bank_last4          TEXT,                        -- last 4 of acct no. (display only)
    -- Platform commission in basis points (200 = 2%). 0 during beta.
    commission_bps      INTEGER NOT NULL DEFAULT 0,
    -- pending | active | disabled
    status              TEXT NOT NULL DEFAULT 'pending',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payout_accounts_merchant ON payout_accounts(merchant_id);
