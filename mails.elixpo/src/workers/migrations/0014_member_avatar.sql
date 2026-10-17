-- mail.elixpo — cache each member's display name + avatar from Elixpo Accounts
-- so the members list can show a real identity (name + photo), not just email.
-- Populated/refreshed on every sign-in and whenever the member views the
-- workspace (from their live session).

ALTER TABLE workspace_members ADD COLUMN avatar TEXT;
