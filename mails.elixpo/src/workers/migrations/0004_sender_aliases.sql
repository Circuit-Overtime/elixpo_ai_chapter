-- mail.elixpo — sender aliases.
-- A sender authenticates as one mailbox (email + app password), but a business
-- often wants to send "as" several From identities through it — support@,
-- accounts@, no-reply@, each with its own display name. An alias stores such a
-- From identity; the underlying SMTP auth stays the sender's mailbox.
--
-- NOTE: the mailbox provider must actually permit the From address (e.g. Gmail
-- "Send mail as" / a Workspace domain), otherwise it may rewrite or reject it.
-- We store the user's declared identities and surface that caveat in the UI.

CREATE TABLE IF NOT EXISTS sender_aliases (
    id           TEXT PRIMARY KEY,                 -- alias_xxx
    tenant_id    TEXT NOT NULL REFERENCES tenants(id),
    sender_id    TEXT NOT NULL REFERENCES senders(id),
    from_email   TEXT NOT NULL,                    -- the From address to send as
    from_name    TEXT,                             -- display name, e.g. "Acme Support"
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sender_id, from_email)
);
CREATE INDEX IF NOT EXISTS idx_aliases_sender ON sender_aliases(sender_id);
CREATE INDEX IF NOT EXISTS idx_aliases_tenant ON sender_aliases(tenant_id);
