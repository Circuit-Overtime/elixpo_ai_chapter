-- Extended org profile fields
ALTER TABLE orgs ADD COLUMN timezone TEXT DEFAULT '';
ALTER TABLE orgs ADD COLUMN location TEXT DEFAULT '';
ALTER TABLE orgs ADD COLUMN contact_email TEXT DEFAULT '';
