---
name: finalize-contribution
description: Reconcile a tracked elixpoo pull request after GitHub reports it merged or closed. Use when Steward Celebrate must validate a terminal fingerprint, update the issue ledger, remove active follow-up memory, retain a bounded completion receipt, and optionally publish a cooldown-controlled safety-gated message.
---

# Finalize a contribution

Use GitHub state as the only terminal authority. Never infer merge or closure from
comments, notifications, branch deletion, or model output.

## Reconcile

1. Load the active follow-up record and require a matching terminal action.
2. Refetch the PR and recompute its outcome fingerprint from the outcome, head SHA,
   and GitHub terminal timestamp.
3. Stop if the record is missing, already completed, or the fingerprint changed.
4. Resolve the original issue key from the stored issue URL and update its ledger
   status to `merged` or `closed`.
5. Move the PR record from active Gist memory into the bounded completion list.
6. Write a versioned local receipt for workflow and future Project reconciliation.

## Optional public response

- Default to no celebration comment.
- When explicitly enabled, publish one short factual message.
- Pass the complete message through the safety role before posting.
- Do not include token usage, internal state, prompts, or operational metadata.

Keep finalization deterministic and idempotent. Do not call a coding model, mutate
the fork, delete shared repositories, or reopen closed work.
