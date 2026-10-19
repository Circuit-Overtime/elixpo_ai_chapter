---
name: pick-safe-issue
description: Select exactly one safe, justified issue from a triaged GitHub candidate queue while enforcing score, solvability, deduplication, repository concurrency, and daily limits. Use when running or reviewing the Pick squad, changing final eligibility or tie-breaking rules, interpreting pick.nothing_eligible, recording state/pick.json, or preventing repeated autonomous work.
---

# Pick Safe Issue

Choose one target only after Triage has established that it is both worthwhile
and bounded. Pick is a deterministic safety boundary, not another opportunity to
reinterpret uncertain issue text.

## Trust only the triage contract

Require all of the following:

- score meets `lib.scorer.THRESHOLD`;
- `tractable` is exactly `true`;
- `easy` is exactly `true`;
- `issue_age_days` is present and between 7 and 60, inclusive;
- `activity_age_days` is present and between 0 and 30, inclusive;
- repository is absent from the blocklist;
- `owner/repo#number` has never been recorded in the ledger;
- the repository has no other open elixpoo pull request;
- no unchanged rejection exists in `state/rejected_issues.json`;
- the daily contribution cap is not exhausted.

Treat missing booleans as false. Never recover an issue rejected by Triage based
on its title, popularity, label, or rationale. Treat a missing or malformed age
as ineligible, so stale triage state cannot bypass either age gate.
Compare rejection memory by both issue key and stored `updated_at`; permit a
changed revision to return to Vet rather than treating every rejection as permanent.

## Select predictably

Rank eligible records by:

1. higher community score;
2. higher solvability confidence;
3. fewer estimated files;
4. existing queue order as the final stable tie-break.

Skip ineligible records and continue. Do not stop merely because a higher-scored
record is blocked. Return no selection when every record fails.

## Propose before final claim

Before exposing a successful pick:

- write `state/pick.json` with `status=pending_vet`, identity, score, scope,
  estimated files, confidence, justification, and timestamp;
- leave the ledger and UTC daily count unchanged until Vet approves the exact
  pending URL;
- return the existing pending target on reruns instead of proposing another issue.

Vet is the only component that converts `pending_vet` to `picked`, records
`owner/repo#number` with status `claimed`, and increments the daily count. A Vet
rejection changes the pick to `rejected` without consuming either ledger entry.

When nothing qualifies, overwrite stale pick output with `picked=false`, a
specific reason, and the evaluation timestamp. Never leave an earlier successful
pick looking like the result of the current run.

## Keep the handoff honest

Build justification from the stored score breakdown and triage rationale. State
why this issue won; do not promise that it is already solved. Pick itself must not
comment upstream, assign an issue, fork a repository, create a branch, or open a
pull request.

Before finishing, verify that one pending target exists at most once. Vet must
reject any result whose URL does not exactly match that pending target.
