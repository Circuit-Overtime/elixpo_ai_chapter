---
name: orchestrate-github-project
description: Reconcile committed elixpoo squad receipts into an issue-backed GitHub Project V2 operations view. Use when creating or updating lifecycle items, provisioning agent-specific fields, enforcing run-ID freshness, recovering missed transitions, or producing sanitized operational status without an external database.
---

# Orchestrate the GitHub Project

Use the original public GitHub issue as the Project item. Key every transition as
`owner/repository#issue`; never create duplicate draft items for the same work.

## Build a snapshot

1. Load the committed ledger and current versioned squad receipts.
2. Resolve the original issue through GitHub and require its node ID.
3. Derive one status and current squad from authoritative receipts.
4. Include only branch and PR URLs, timestamps, token totals, Doctor warning, and
   cleanup status. Exclude source, prompts, comments, transcripts, and secrets.
5. Use GitHub terminal state and the ledger for merged or closed work.

## Reconcile safely

- Resolve the configured user or organization Project by number.
- Provision only missing agent-specific fields. Fail when a same-named field has
  an incompatible type; never rewrite human fields.
- Add the external issue with `addProjectV2ItemById` only when it is absent.
- Update only values that changed.
- Reject a different run ID when its timestamp is not newer than the stored item.
- Isolate per-item failures and emit a bounded versioned receipt.

## Recover

Reconcile after state-writing workflows and on a low-frequency schedule. Treat the
scheduled pass as recovery for missed webhooks or dispatches. Replaying the same
snapshot must be harmless.

Do not create a database, publish private metadata, delete Project items, archive
history automatically, or let one malformed ledger record block other items.
