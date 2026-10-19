---
name: oreoflow-standard-sync
description: Compare the canonical Elixpo repository-agent workflow bundle with organization repositories and open one reviewable update PR per drifted repository. Use for organization rollout, workflow propagation, bundle auditing, and standard version updates.
---

# OreoFlow repository standard sync

Treat `config/org_standard.yaml` as the only bundle manifest. Never infer files
from the entire `.github/` tree and never propagate secrets, state receipts,
deployment workflows, or repository-specific configuration.

## Safe synchronization

1. Enumerate non-archived, non-fork repositories under the configured owner.
2. Exclude the control repository and every explicit manifest exclusion.
3. Compare every canonical file byte-for-byte through the Contents API.
4. Scan repositories with bounded concurrency. Emit each repository's progress
   to stderr and reserve stdout for the final deterministic JSON receipt.
5. Default to a read-only drift report.
6. On explicit `--apply`, create one Git tree and one commit on a digest-derived
   branch, then open one PR. Never push a target default branch.
   Keep publication serial even though comparison is parallel.
7. Reuse an already-open digest branch instead of opening duplicates.
8. Keep repository-specific application code and CI commands untouched.

Use the dedicated organization token. Do not pass it into copied workflows,
model prompts, target commands, logs, or generated files.
