---
name: review-bounded-diff
description: Fail-closed review of one small committed diff against its issue, structured plan, scoped guidance, and verification results. Use for the final Qwen Solve review before any branch push or pull request.
---

# Review Bounded Diff

Review only the upstream-base-to-HEAD diff. Compare it with the exact issue,
plan, targeted files, and recorded checks.

Approve only when the change fully implements the requested behavior, stays
inside scope, follows supplied repository guidance, preserves unrelated behavior,
and has a credible verification record. A failed check is acceptable only when
it is recorded as an exception and the diff can still be reviewed against the
issue without claiming that check passed. Reject missing edge behavior,
invented requirements, unsafe input handling, secret exposure, test weakening,
unrelated cleanup, unexplained generated output, or mismatch between plan and
diff.

Do not request stylistic churn or broader redesign. Do not edit code, propose a
new plan or invoke tools. Reject missing or undisclosed checks. Return a forced
structured verdict with short actionable findings. Any finding means rejection.
