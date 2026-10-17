-- Short professional headline shown with an author's public identity.
ALTER TABLE users ADD COLUMN designation TEXT NOT NULL DEFAULT '';
