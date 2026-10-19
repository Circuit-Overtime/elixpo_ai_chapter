# Elixpoo

Elixpoo is Elixpo's organization-wide GitHub project-management agent. One central runtime keeps routine repository administration consistent without becoming a coding agent.

Elixpoo v2 can:

- classify issues and pull requests with a centrally allowed label taxonomy;
- add each opted-in item to GitHub Project V2 and update supported fields;
- answer exact `@elixpoo` mentions or perform permission-checked metadata actions;
- leave evidence-grounded, COMMENT-only pull-request reviews;
- answer mentions and curate activity on the canonical `elixpo/elixpo` Discussions surface;
- record one compact, schema-versioned Gist entry after each merged PR.

It never edits repository source, creates solution branches or commits, or opens code-solving pull requests. Requests to fix or implement code receive a deterministic refusal plus a human-oriented planning alternative.

## Architecture

Participating repositories install thin callers from [`distribution/workflows`](distribution/workflows). They invoke four pinned reusable workflows hosted here:

- triage;
- exact mentions;
- PR review;
- merged-change memory.

Permissions, label and Project-field allowlists, idempotency, revision checks, and mutation authorization are deterministic. Pollinations models are reached only through `rtk.Router` for classification, rewriting, summaries, answers, and review reasoning. Public generated text passes the safety route before publication.

See [`docs/elixpoo-v2.md`](docs/elixpoo-v2.md) for the runtime and authorization contract and [`docs/elixpoo-v2-audit.md`](docs/elixpoo-v2-audit.md) for the migration audit.

## Local checks

```bash
python -m pytest tests/test_elixpoo_v2.py tests/test_elixpoo_v2_workflows.py tests/test_rollout_prs.py
python -m agents.rollout_prs
python -m agents.rollout_audit --repo agent.elixpo
```

The rollout audit is read-only. Its source of truth is [`config/elixpoo_rollout.yaml`](config/elixpoo_rollout.yaml); archived, private, cancelled, and deferred repositories are excluded unless explicitly opted in.

## Repository map

| Path | Purpose |
| --- | --- |
| `agents/elixpoo_v2/` | Central triage, mention, review, Project, and merge-memory runtime |
| `skills/` | Focused v2 operating contracts |
| `rtk/` | Pollinations routing, budgets, compression, cache, and ledger |
| `lib/` | GitHub, state, configuration, and shared deterministic plumbing |
| `distribution/workflows/` | Copy-ready callers for participating repositories |
| `config/elixpoo_v2.yaml` | Metadata allowlists and public limits |
| `config/elixpoo_rollout.yaml` | Organization rollout manifest |
| `agent.elixpo/` | Read-only public operations dashboard |

## Required configuration

- `ELIXPO_POLLINATIONS_API_KEY`
- `ELIXPOO_GITHUB_AGENTIC_TOKEN`
- `ELIXPOO_GITHUB_PROJECT_TOKEN`, `ELIXPO_GITHUB_PROJECT_OWNER`, `ELIXPO_GITHUB_PROJECT_NUMBER`
- `ELIXPOO_GIST_AGENTIC_TOKEN`, `ELIXPOO_FOLLOWUP_GIST_ID`
- `ELIXPOO_GITHUB_DISCUSSIONS_TOKEN` in the canonical Discussions host

Exact fine-grained permissions are documented in [`distribution/README.md`](distribution/README.md).

Historical Scout → Solve implementation remains available only as disconnected reference under [`docs/archive/autonomous-contributor`](docs/archive/autonomous-contributor/README.md).
The exact final pre-v1 snapshot is tagged [`legacy-autonomous-contributor-v1`](https://github.com/elixpo/agent.elixpo/tree/legacy-autonomous-contributor-v1).
