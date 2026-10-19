---
name: summarize-merged-change
description: Create one compact factual merged-change record for the approved revisioned Gist.
---

# Summarize a merged change

## Trigger

A pull request closes with `merged=true` in an opted-in repository.

## Required evidence

Repository, PR number/URL, merge SHA, title, author, merger, merged timestamp,
labels, changed-file paths, and PR body.

## Allowed actions

Generate a short factual summary and deterministic breaking, migration, release,
documentation, follow-up, and changed-area signals. Write only the approved Gist file.

## Output contract

One schema-v2 `MergeRecord` with idempotency key
`repository#number:merge_sha`; retain at most 300 records.

## Authorization and idempotency

Require a genuine merged event, optimistic Gist revision check, and exact key
deduplication. A revision conflict aborts; never overwrite concurrent state.

## Refuse

Never store secrets, diffs, private content, credentials, email addresses, or
unnecessary personal data.

## Example

A documentation-only PR records `documentation=true`, its top-level changed
areas, and a factual summary without copying the patch.
