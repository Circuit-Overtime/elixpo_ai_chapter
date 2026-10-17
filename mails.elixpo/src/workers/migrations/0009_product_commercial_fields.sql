-- mail.elixpo — commercial details on products.
--
-- A product now has a public-facing identity (the business's service) shown on
-- its detail page: a description, homepage, support email, and logo. Templates
-- are associated to a product via webhooks (configured on the product), so the
-- product page is the commercial hub.

ALTER TABLE products ADD COLUMN description   TEXT;
ALTER TABLE products ADD COLUMN homepage_url  TEXT;
ALTER TABLE products ADD COLUMN support_email TEXT;
ALTER TABLE products ADD COLUMN logo_url      TEXT;
