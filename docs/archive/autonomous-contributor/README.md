# Archived autonomous-contributor direction

Before Elixpoo v1, this repository explored an autonomous
Scout → Triage → Pick → Vet → Admission → Solve → Submit contributor flow.
That product direction is inactive.

Elixpoo v1 does not edit product source, create solution branches or commits,
or open code-solving pull requests. The old modules remain temporarily as
implementation history while references are audited. Their workflows are
manual-only and are not part of the supported runtime.

The reusable lessons retained in v1 are bounded context, typed model output,
deterministic authorization, public-response safety, state integrity, usage
budgets, and idempotent GitHub/Gist operations.

## Frozen reference

The final pre-v1 control-repository state is preserved at
[`legacy-autonomous-contributor-v1`](https://github.com/elixpo/agent.elixpo/tree/legacy-autonomous-contributor-v1),
commit [`c31fffb`](https://github.com/elixpo/agent.elixpo/commit/c31fffb731d6cf9135591f30b7ead8dd05721c99).
It is historical source, not a supported deployment target. The supported
project-management runtime begins at the protected `v1` tag.
