-- Pricing tiers: a product (= app) can have multiple price tiers, each with a
-- human label (e.g. "Basic", "Pro", "Yearly"). nickname holds that label.
ALTER TABLE prices ADD COLUMN nickname TEXT;
