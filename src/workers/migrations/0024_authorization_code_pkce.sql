-- Store the public PKCE challenge alongside each authorization request.
-- The verifier remains exclusively with the OAuth client.
ALTER TABLE auth_requests ADD COLUMN code_challenge TEXT;
ALTER TABLE auth_requests ADD COLUMN code_challenge_method TEXT;
