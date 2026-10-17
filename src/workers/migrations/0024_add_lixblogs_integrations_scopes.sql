-- Add the new Cloudinary integration scopes to existing LixBlogs CLI
-- clients' allowed scope lists. Companion to elixpo/blogs.elixpo#252.
UPDATE oauth_clients
SET scopes = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM json_each(scopes)
        WHERE value = 'lixblogs:integrations:cloudinary:read'
    ) THEN json_insert(scopes, '$[#]', 'lixblogs:integrations:cloudinary:read')
    ELSE scopes
END
WHERE client_id IN ('lixblogs-cli-dev', 'lixblogs-cli-staging', 'lixblogs-cli-prod');

UPDATE oauth_clients
SET scopes = CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM json_each(scopes)
        WHERE value = 'lixblogs:integrations:cloudinary:disconnect'
    ) THEN json_insert(scopes, '$[#]', 'lixblogs:integrations:cloudinary:disconnect')
    ELSE scopes
END
WHERE client_id IN ('lixblogs-cli-dev', 'lixblogs-cli-staging', 'lixblogs-cli-prod');
