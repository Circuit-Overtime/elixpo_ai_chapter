---
name: verify-repository-change
description: Validate one planned repository change with bounded allowlisted commands and scope checks before committing. Use for Solve test, lint, typecheck, build, changed-file validation, command safety, and incremental commit phases.
---

# Verify Repository Change

Confirm that every changed path belongs to the current step and full plan. Reject
untracked or modified scope outside those paths, symlinks, empty changes, and
generated surprises.

Parse verification commands into argument vectors and execute without a shell.
Require a configured prefix allowlist. Reject composition operators, redirects,
installers, network clients, deployment, publishing, destructive commands, and
credential access. Apply per-command timeouts and RTK output compression.

Strip token, key, secret, password, and private-key environment variables from
every target-repository subprocess. Permit at most one configured dependency
setup command. Treat setup as untrusted code in the disposable sandbox and never
record its output as a successful behavioral check.

Continue through the bounded command plan after a non-zero exit. Do not retry
automatically, alter the command, or weaken configuration. Preserve compact
failure output as a verification exception for diagnosis and PR disclosure.
Treat failed checks as advisory only after the requested implementation is
complete and self-reviewed.

After all checks are attempted, verify they introduced no tracked changes, then
stage only declared files. Require a conventional
commit message and a non-empty staged diff, then create exactly one local commit.
Require a clean working tree after the final step. Do not push.
