PRAGMA foreign_keys = ON;

INSERT INTO users (id, email, display_name, updated_at)
VALUES ('crumb-local-user', 'developer@localhost', 'Local Developer', unixepoch())
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  updated_at = excluded.updated_at;

INSERT INTO sessions (id, user_id, expires_at)
VALUES ('crumb-local-session', 'crumb-local-user', 2147483647)
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  expires_at = excluded.expires_at;
