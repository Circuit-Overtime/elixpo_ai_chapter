---
name: acquire-github-workspace
description: Prepare an isolated GitHub fork and exact issue branch before implementation. Use for the Solve workspace-acquisition phase, fork validation, upstream synchronization, credential-safe cloning, branch naming, or workspace confinement.
---

# Acquire GitHub Workspace

Accept only the exact URL approved by Vet. In production, require the matching
Pick and ledger claim. In owned-test mode, require an allowlisted repository,
matching test-mode Vet approval, and GitHub-reported push permission.

Resolve the authenticated fork owner. Reuse an existing repository only after
verifying its parent/source is the target; otherwise create the fork and wait a
bounded time for readiness. Never overwrite an unrelated same-named repository.

Create one fresh isolated directory. Clone the fork without tags, add the source
as `upstream`, fetch the upstream default branch, and create exactly one new
natural branch from the fetched commit: `feat/<issue-slug>-<number>-<hex>` for
feature signals or `patch/<issue-slug>-<number>-<hex>` otherwise. Configure the
bot identity locally.

Pass authentication through process environment, never URLs, prompts, logs, or
command arguments. Use argument-vector subprocesses without a shell. Do not
push, modify upstream, delete an existing workspace, reuse a dirty workspace,
or create a pull request during acquisition.

Record upstream, fork, base branch, work branch, workspace, issue, and test mode
in bounded state. Fail once on permission, fork, clone, fetch, or checkout error.
