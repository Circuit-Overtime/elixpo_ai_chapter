# Elixpoo v2 architecture

## Contract

Elixpoo v2 manages GitHub project records; it does not modify product code. Four event-driven capabilities share one central Python runtime and are invoked through pinned reusable workflows.

| Event | Deterministic boundary | Model contribution | Mutation |
| --- | --- | --- | --- |
| Issue/PR opened or edited | label and field allowlists | classification, sparse-description note | labels and one Project item |
| Exact `@elixpoo` mention | permission tier, assignability, typed action | answer, summary, rewrite proposal | only authorized metadata |
| PR opened or synchronized | API-only evidence, head-SHA marker | actionable review findings | COMMENT review only |
| PR merged | schema, redaction, revision and idempotency key | factual short summary | one bounded Gist record |

## Trust model

Repository content is untrusted evidence. The runtime sanitizes instruction-shaped text and secret-like values before including them in model context. A Pydantic action schema rejects extra operations. Deterministic code then checks actor permission, item authorship, GitHub assignability, and central allowlists. Public model-authored output passes the safety model and receives a disclosure plus an operation marker.

Forked pull requests are reviewed from GitHub API metadata and diffs. V1 neither checks out nor executes fork code, and no caller uses `pull_request_target`.

## Deployment

Copy only the relevant files from `distribution/workflows/` into an opted-in repository. Keep the reusable call pinned to the approved `v2` ref. Configure repository tokens and Project variables as described in `distribution/README.md`, then enable the corresponding capability in `config/elixpoo_rollout.yaml`.

Run `python -m agents.rollout_audit` to compare that manifest with live workflow files. It reports current, missing, stale, deferred, excluded, and unexpected callers without changing repositories.

The canonical Discussions workflow stays in `elixpo/agent.elixpo` and targets `elixpo/elixpo`; it is not distributed.

## State

GitHub issues, pull requests, labels, and Project V2 are authoritative. The approved Gist stores bounded schema-v2 merged-change history and Discussion cursors. Optimistic revision checks prevent concurrent overwrites; duplicate merge keys and public markers prevent repeated actions.
