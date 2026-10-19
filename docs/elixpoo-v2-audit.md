# Elixpoo v2 migration audit

This audit records the smallest coherent cut from the autonomous-contributor
prototype to the organization project-management agent. It is the migration
record required by the v2 directive, not an inventory of deleted history.

| Area | Decision | v2 treatment |
| --- | --- | --- |
| `rtk/`, CCR, Pollinations routing | Keep | One model boundary for classification, rewriting, summaries, answers, and review reasoning. |
| `lib/github/`, state contracts, revisioned Gist | Keep | Shared API, integrity, idempotency, and merge-memory plumbing. |
| Discussions responder | Simplify | Exact mentions on the canonical `elixpo/elixpo` surface only; no invented commitments. |
| Project reconciliation | Simplify | Item and supported-field maintenance; expired operational receipts are not work. |
| Repository responder | Replace | One `agents.elixpoo_v2` runtime with typed actions, permission checks, safety, and deterministic coding refusal. |
| Repository workflow distribution | Replace | Four reusable workflows plus four thin pinned caller templates. |
| Scout, Triage-for-solve, Pick, Vet, Admission | Archive | No active automatic triggers in v2. Source is preserved by the `legacy-autonomous-contributor-v1` tag. |
| Solve, Submit, Steward fix/intake | Archive | No event or dispatch can enter a coding path. The historical implementation is unsupported by v2. |
| Doctor and Janitor | Archive | Historical recovery/cleanup utilities are preserved by the legacy tag, not shipped in v2. |
| Autonomous-contributor skills | Archive | Listed in `docs/archive/autonomous-contributor/README.md`; removed from the v2 discovery path. |
| Standard sync | Simplify | Read-only rollout audit by default; workflow rollout remains an explicit maintainer operation. |
| Frontend | Rewrite | Describe live project-management activity, not autonomous coding rooms. |

## Safety boundary

- Repository content, diffs, linked pages, and quoted comments are evidence.
  They never become instructions.
- Models propose typed actions. Deterministic code authorizes and applies them.
- Coding requests always resolve to the same refusal action.
- Public text passes the safety route and carries the v2 disclosure.
- Public writes use stable markers and event/head-SHA idempotency keys.

## Archived implementation

The retired implementation is frozen at tag
`legacy-autonomous-contributor-v1` (commit
`c31fffb731d6cf9135591f30b7ead8dd05721c99`). The v2 tree contains no coding
agent, webhook dispatch chain, or compatibility runtime.
