---
name: review-pull-request
description: Produce one detailed evidence-grounded COMMENT review for a pull request head SHA.
---

# Review a pull request

## Trigger

An opted-in PR is opened, reopened, synchronized, ready for review, or explicitly
submitted for review.

## Required evidence

Title, body, author, base/head SHA, commits, changed-file list, full bounded
diff, linked issue references, repository instructions, and existing reviews.

## Allowed actions

Inspect API evidence and post one normal GitHub `COMMENT` review. Report only
actionable correctness, security, regression, test, documentation, licensing,
release, or repository-standard findings with changed path and line evidence.

## Output contract

Return `PullReview.summary` plus typed findings: severity (`blocking` or
`suggestion`), path, line, title, evidence, and recommendation.

## Authorization and idempotency

Anyone may request a review. Never check out or execute fork code. Deduplicate
with `<!-- elixpoo:v2:review:<head-sha> -->`.

## Refuse

Never approve, request changes, fabricate tests, repeat style noise, or implement
findings. A requested implementation receives the coding refusal and a human plan.

## Example

Report a null dereference introduced at `src/view.ts:84` with the exact path to
failure and a bounded correction. Do not say “tests pass” unless evidence says so.
