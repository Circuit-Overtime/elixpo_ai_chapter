-- mail.elixpo — unsubscribe / suppression list (platform-managed).
--
-- A recipient who unsubscribes (one-click List-Unsubscribe, or manual add in the
-- dashboard) is recorded here per product. The send pipeline skips suppressed
-- recipients — UNLESS the template is marked `transactional` (receipts, password
-- resets) which are exempt and always send.

CREATE TABLE IF NOT EXISTS suppressions (
    id          TEXT PRIMARY KEY,                 -- sup_xxx
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    product_id  TEXT NOT NULL REFERENCES products(id),
    email       TEXT NOT NULL,                    -- stored lowercased
    reason      TEXT,                             -- unsubscribe | manual | bounce
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, email)
);
CREATE INDEX IF NOT EXISTS idx_suppressions_product ON suppressions(product_id);

-- Transactional templates bypass suppression (CAN-SPAM exempt).
ALTER TABLE templates ADD COLUMN transactional INTEGER NOT NULL DEFAULT 0;
