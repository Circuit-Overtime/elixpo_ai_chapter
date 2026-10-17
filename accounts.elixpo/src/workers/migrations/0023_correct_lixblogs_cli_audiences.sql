-- Correct the LixBlogs CLI resource audiences to the hosts that serve its API.
-- Public clients retain the sentinel hash required by oauth_clients.NOT NULL;
-- client_type controls that no client secret is accepted or required.
UPDATE oauth_clients
SET
    audience = CASE client_id
        WHEN 'lixblogs-cli-dev' THEN 'localhost:3000'
        WHEN 'lixblogs-cli-staging' THEN 'lixblogs.pages.dev'
        WHEN 'lixblogs-cli-prod' THEN 'blogs.elixpo.com'
    END,
    client_type = 'public',
    client_secret_hash = '0000000000000000000000000000000000000000000000000000000000000000'
WHERE client_id IN (
    'lixblogs-cli-dev',
    'lixblogs-cli-staging',
    'lixblogs-cli-prod'
);
