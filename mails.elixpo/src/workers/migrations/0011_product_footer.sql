-- mail.elixpo — product email footer (brand block appended to every send).
--
-- The footer is built from the product that triggered the send: its logo,
-- homepage, and support email (already on the product) plus a physical address
-- (CAN-SPAM), a phone number, and a short quote/tagline. Rendered email-safe
-- below the content card.

ALTER TABLE products ADD COLUMN address     TEXT;
ALTER TABLE products ADD COLUMN phone       TEXT;
ALTER TABLE products ADD COLUMN footer_note TEXT;  -- short quote / tagline
