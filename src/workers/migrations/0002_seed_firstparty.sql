-- Seed the first-party Elixpo tenant. Claimed on first login by the user whose
-- SSO email matches ELIXPO_MAIL_OWNER_EMAIL (see src/lib/tenant.ts). owner_uid
-- is left NULL until then.
INSERT OR IGNORE INTO tenants (id, name, email, owner_uid, status)
VALUES ('tenant_elixpo', 'Elixpo', NULL, NULL, 'active');
