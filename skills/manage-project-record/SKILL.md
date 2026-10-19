---
name: manage-project-record
description: Create or reconcile one GitHub Project V2 record using supported fields and deterministic authorization.
---

# Manage a Project record

## Trigger

Triage, an authorized exact mention, or a terminal GitHub event requires Project
metadata reconciliation.

## Required evidence

Canonical issue/PR node ID, repository, kind, state, labels, current Project
item, configured Project owner/number, and allowed field values.

## Allowed actions

- Add the canonical content node once.
- Set Repository, Kind, Status, Priority, and Area when configured.
- Update only values in the central allowlist.

## Output contract

Return the item ID, created/reused flag, changed fields, and event idempotency
key. Model prose is never a field identifier or mutation command.

## Authorization and idempotency

Automatic triage may create/reconcile the record. Mention-requested field
changes require repository `triage` or higher. Resolve by content node ID before
creation and update only differing fields.

## Refuse

Reject unknown projects, fields, options, stale node identities, missing write
scope, or destructive item deletion.

## Example

Re-running an `opened` delivery finds the existing Project item and performs
zero writes when Status and Area already match.
