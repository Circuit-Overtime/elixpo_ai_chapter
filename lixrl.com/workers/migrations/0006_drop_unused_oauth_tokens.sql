-- Lixrl only needs the short-lived access token during the OAuth callback to
-- fetch the user profile. Retaining provider access and refresh tokens added
-- credential exposure without supporting any product behaviour.
DROP TABLE IF EXISTS oauth_tokens;
