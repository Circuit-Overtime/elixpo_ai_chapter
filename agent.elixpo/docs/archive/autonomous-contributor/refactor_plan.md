# elixpoo — Preliminary Plan

> Autonomous GitHub contributor agent. Runs entirely inside the GitHub ecosystem as a GitHub App. Picks up 4–5 community issues per day, forks, solves, opens PRs, and shepherds them through review until merge or graceful close.

---

## 1. Operating principles

These are hard rules. The system is designed around them, not bolted on after.

1. **No spam.** Hard cap of 4–5 PRs per day, global. Max 1 open PR per upstream repo at a time.
2. **Quality over volume.** Never submit a PR unless the project's existing tests pass *and* we've added at least one test that fails without our change.
3. **Honest disclosure.** Every comment and PR is posted by `elixpoo[bot]`. PR bodies explicitly say it's an autonomous contributor. No hiding.
4. **Respect opt-out.** Scout checks each repo for `elixpoo-opt-out` topic, `no-ai-contributions` files, and CONTRIBUTING signals. Once blocked, blocked forever.
5. **Community issues only.** Strict scorer — see §4.
6. **Graceful failure.** If we can't solve, we post a polite "releasing this back" comment and unclaim. No abandoned ghost-claims.
7. **Everything in GitHub.** No external databases, no dashboards we have to host. The control repo *is* the system.

---

## 2. Architecture overview

One private control repo: `elixpoo-ops`. One GitHub App: `elixpoo`. One optional Cloudflare Worker for webhook ingress (stateless, ~50 lines).

The control repo holds:
- **Workflows** — squad runtimes under `.github/workflows/`
- **Tracking issues** — one per external PR, title format `[owner/repo#NNN] short description`, labels carry state
- **Candidate issues** — opened by Triage with full context, promoted by Pick
- **Project board** — kanban over the issues, columns = state labels. This is the live dashboard.
- **Discussions** — daily summaries, weekly retros
- **`state/` directory** — JSON ledgers committed back by workflows (blocklist, persona profiles, token spend log)
- **Public Gist** owned by elixpoo — world-readable transparency log

The control repo's git history *is* the audit trail of the entire system.

---

## 3. The squads

Six squads, each one or more GitHub Actions workflows, chained via `workflow_run`, `repository_dispatch`, or label changes.

### Scout — Discovery
- **Trigger:** cron, daily
- **Budget:** 10 min
- **Job:** Sweep GitHub for Python, TypeScript, JavaScript, and Shell repositories. Hard filters: 100–15k stars, active in the last 21 days, declared license, issues enabled, not a fork, not in blocklist or opted out. Rank by contribution guidance, recent activity, and a manageable issue backlog; round-robin across language and size lanes so popularity is secondary.
- **Agents:** trending-crawler, topic-crawler, language-specialist, repo-health-scorer, blocklist-checker, opt-out-checker
- **Output:** ~20 candidate repos written to `state/candidates.json`
- **Skill:** `skills/discover-contributor-repositories/SKILL.md`

### Triage — Issue selection
- **Trigger:** on Scout completion
- **Budget:** 15 min
- **Job:** Pull recently active open issues from approved repos, discard obvious non-candidates, score the remainder, and assess bounded solvability. `good first issue` is a bonus, not a discovery requirement.
- **Agents:** label-classifier, complexity-estimator, reproducibility-checker, claim-checker (has anyone already said "I'll take this"?), priority-ranker
- **Output:** A ranked `state/triaged.json` queue with score, scope, confidence, blockers, and an explicit `easy` verdict.
- **Skill:** `skills/triage-solvable-issues/SKILL.md` (loaded into each routed triage call)
- **Supply rule:** Inspect up to 16 Scout repositories and perform free PR-conflict checks on up to three times the paid shortlist. Routed triage remains capped at 12 issues.

### Pick — Final selection
- **Trigger:** cron, separate window from Scout
- **Budget:** 5 min
- **Job:** Select one eligible issue that passes both the community score and the fail-closed easy-work gate, then record it before implementation starts.
- **Output:** One justified choice in `state/pick.json`; the ledger prevents duplicate picks and parallel work in the same repository.
- **Skill:** `skills/pick-safe-issue/SKILL.md`

### Vet — Final issue suitability
- **Trigger:** consumes a provisional Pick before any claim or clone; manual mode supports configured owned-repository tests.
- **Budget:** 12k tokens maximum, normally zero or one `nova-fast` call.
- **Job:** Read the complete issue conversation, parent/sub-issue relationships, and linked PR evidence. Reject tracking parents, occupied work, unresolved decisions, unbounded tasks, and work anticipated to exceed 15 focused minutes.
- **Output:** `state/vet.json` plus revision-aware rejected issue memory in `state/rejected_issues.json`.
- **Skill:** `skills/vet-issue-suitability/SKILL.md`

Rejected issues are stored in a dictionary keyed by `owner/repo#number`, making
lookup constant-time. Each record stores the issue's `updated_at` revision.
Triage and Pick skip an unchanged rejected revision, while new conversation
activity permits one fresh evaluation.

### Comprehend — Harness tool phase
*(Runs inside Solve, not as a separate workflow.)*
- **Job:** Use bounded Glob/Grep/Read calls to locate scoped guidance, manifests, and exact implementation files before editing.
- **Target:** repository-grounded context discovered on demand; no bulk snapshot or guessed target path.
- **Skill:** included in `skills/solve-bounded-issue/SKILL.md`

### Solve — Coding
- **Trigger:** a revision-bound `oreoflow/approved` admission from the control
  repository, one Doctor-authorized retry of that same admission, or explicit
  allowlisted owned-test mode. A successful Vet never starts Solve directly.
- **Budget:** 15 minutes and 24k tokens; no whole-pipeline retry.
- **Agents:** Python workspace supervisor, CCR-routed Node coding harness, deterministic verifier.
- **Model:** `qwen-coder` runs through the CCR Node coding harness. Python supervises the same bounded session locally and in Actions, then owns verification and commit gates.
- **Sandbox:** one isolated temporary Git workspace cloned from the authenticated fork.
- **Output:** one local reviewed commit and `state/solve.json`; no push until every gate passes.
- **Skill:** `skills/solve-bounded-issue/SKILL.md`.

### Submit — PR creation
- **Trigger:** `state/solve.json` reaches `ready_to_submit` in the same runner.
- **Budget:** 5 min
- **Agents:** branch-namer, commit-message-writer (conventional commits), pr-body-writer (links issue, lists tests, includes bot disclosure), label-applier
- **Output:** exact fork branch pushed once, disclosed PR opened upstream, ledger updated.
- **Skill:** `skills/submit-autonomous-pr/SKILL.md`

### Doctor — Live supervision and failure decisions

- **Trigger:** starts with the bounded harness, then evaluates `doctor_pending` on failure.
- **Live job:** consume structured stream usage, warn at the advisory token target,
  steer repeated tool chains, and stop only at the hard ceiling or when a loop and
  abnormal token growth occur together.
- **Terminal job:** validate versioned evidence, fingerprint the failure, and choose
  one deterministic `retry`, `terminate`, or `preserve` outcome.
- **Retry policy:** at most one retry across an issue's recovery chain. A repeated
  fingerprint or a second changed failure terminates the loop.
- **Output:** `state/doctor.json` plus a mirrored decision in `state/solve.json`.
- **Skill:** `skills/diagnose-agent-failure/SKILL.md`.
- **Model cost:** zero; unknown failures are preserved rather than guessed.

### Janitor — Resource cleanup

- **Trigger:** a Doctor decision, a matching successful Submit receipt, or a daily
  partial-cleanup audit.
- **Job:** preflight every resource, remove exact authorized workspaces and isolated
  CCR temporary directories, terminate only verified recorded process groups, and
  preserve shared forks.
- **Output:** idempotent `state/janitor.json` per-resource receipts and cleanup status
  in `state/solve.json`.
- **Skill:** `skills/clean-agent-resources/SKILL.md`.
- **Safety:** no globbing, symlink following, inferred targets, broad process killing,
  or workspace cleanup while Solve/Submit still needs it.

### Steward — Follow-through
Three workflows triggered by webhooks (via the Cloudflare Worker forwarding to `repository_dispatch`):

- **`steward-respond.yml`** — fires on `issue_comment` or `pull_request_review`. Parses intent (change request? question? rejection?), drafts a reply, runs it through the safety gate, posts it.
- **`steward-fix.yml`** — fires on `check_suite` failure. Reads the CI failure, attempts a fix commit on the fork's branch.
- **`celebrate.yml`** — fires on `pull_request` merged. Generates the celebration image via gptimage, posts to Discussions, updates ledger.

Plus a slow cron `steward-poll.yml` as a webhook-loss safety net (runs 2×/day, catches anything missed).

---

## 4. The "community issues only" scorer

A scored decision, not a single rule. An issue qualifies if total ≥ threshold:

| Signal | Score |
|---|---|
| Labelled `good first issue` / `help wanted` / `up-for-grabs` / `hacktoberfest` | +5 |
| Reproducible bug, with or without a label | +3 |
| No assignee | +2 |
| Model finds no current maintainer ownership in the conversation | +2 |
| Has a clear acceptance criterion in description | +2 |
| Issue older than 7 days (not under active triage) | +1 |
| OP is a core maintainer without an explicit community-work label (likely a self-note) | −5 |
| Model finds that another contributor currently owns the work | −10 |
| Touches `internal/` or `private/` paths | −10 |
| Repo's CONTRIBUTING says "discuss first" and no discussion exists | −5 |

Threshold: ≥ 8 to enter the queue. Tunable based on early merge-rate data.

The score is necessary but not sufficient. Pick also requires every hard
solvability gate below:

- `tractable=true`, with `trivial` or `small` complexity;
- created 7 to 60 calendar days before the triage run, inclusive;
- an estimated one to five changed files and confidence of at least 0.70;
- a clear acceptance criterion, or a bug label paired with reproduction steps;
- no assignee or recent claim;
- activity within the last 30 days;
- no unresolved maintainer decision, private access, secrets, privileged
  infrastructure, specialized hardware, or internal/private paths;
- no design, discussion, question, or triage-stage label.

Missing fields fail closed. The `good first issue` label is supporting evidence,
not proof that the work is easy, and its absence does not prevent a reproducible
bug or another explicitly invited community issue from qualifying.

Creation age and literal `internal/` or `private/` path references are computed
from GitHub timestamps and path patterns. Current ownership, resolution, scope,
and requirement clarity are interpreted by `nova-fast` from the chronological
issue conversation through forced structured output. Issues outside the 7–60 day
creation window or untouched for over 30 days are removed before that call. Pick
independently rechecks both stored ages, proposes `pending_vet`, and Vet alone
records the ledger claim after approving the exact pending URL.

### Local dry run

The four stages only read public GitHub data and write local `state/*.json`;
they do not comment, fork, or open a pull request:

```bash
python -m agents.scout
python -m agents.triage
python -m agents.pick
python -m agents.vet
```

Local configuration loads from `.env.local`. Scout accepts either `GITHUB_TOKEN`
or `ELIXPOO_GITHUB_AGENTIC_TOKEN`; triage also requires
`ELIXPO_POLLINATIONS_API_KEY`. Inspect `state/candidates.json`,
`state/triaged.json`, and `state/pick.json` after each stage.

Solve and Submit are mutating stages and are intentionally separate from this
read-only dry run. For the owned test target:

Set `AGENT_GITHUB_SOLVER_TOKEN` to the fork owner's dedicated classic PAT
with `public_repo`; Solve and Submit do not fall back to the general agentic
token or the workflow-provided `GITHUB_TOKEN`.

```bash
python -m agents.vet https://github.com/elixpo/lixrl.com/issues/9 --owned-test --force
python -m agents.solve --issue-url https://github.com/elixpo/lixrl.com/issues/9 --owned-test
python -m json.tool state/solve.json
python -m agents.submit
```

Do not run Submit until `state/solve.json` is `ready_to_submit` and its recorded
checks, files, commits, branch, and token spend are acceptable.

Every configuration, provider, workspace, context, structured-output, timeout,
token-budget, verification, policy, and review failure becomes
`doctor_pending`. The versioned failure record includes its stage, retryability
signal, candidate action, elapsed time, token spend/limit, and exception type.
Solve does not retry itself. It emits a Janitor cleanup manifest and invokes
Doctor on the same runner. Doctor authorizes at most one fresh-run retry or a
terminal/preservation outcome. Janitor then cleans the exact current-run resources
before the runner exits; shared forks are always preserved. A daily audit retries
only expired partial cleanup receipts.

---

## 5. Model routing (Pollinations)

Roles map to models, not the other way around. Agents request `model: "code"`, the router resolves it. Swappable without touching agent code.

| Role | Model | Notes |
|---|---|---|
| Repo crawling, label classification | `nova-fast` | Cheapest tool-capable model |
| Issue scoring, triage reasoning | `nova-fast` | Lowest explicitly priced general tool-calling model |
| Final issue suitability verification | `nova-fast` | One compact structured call after zero-cost gates |
| Repository comprehension | deterministic retrieval | No model; bounded tracked-file context |
| **Comprehend + implement** | `qwen-coder` | One CCR-routed Node harness, at most 14 turns |
| Deterministic review | Python | File, diff, command, test, time, and token gates |
| PR body, commit messages | `mistral` | Natural prose, cheap |
| Steward replies | `kimi` | Good at conversational follow-ups + tool use |
| Safety gate before posting | `qwen-safety` | Costs ~nothing, blocks problematic outputs |
| Celebration image | `gptimage` | On merge only |

Solve has a hard 24k-token ceiling; the other squads keep their own independent budgets.

---

## 6. The token layer ("RTK")

A thin module (`rtk/`) imported by every workflow. Wraps the Pollinations client.

**Responsibilities:**
- Pre-call token count via tiktoken
- Per-task budget enforcement — refuse the call if it'd blow the ceiling
- Context compression — strip comments, collapse whitespace, drop irrelevant imports
- Prompt prefix caching — hash the prefix, route to `promptCachedTokens` pricing (10× cheaper) where supported
- Per-task ledger — every call writes one line to `state/token_log.jsonl`
- Kill switch — task auto-aborts at 3× its budget

**Per-task default budget:** 100k tokens, ceiling 300k.

**Interface sketch:**
```python
from rtk import Router

router = Router(task_id="elixpoo-ops#42", budget=100_000)
response = router.call(role="code", messages=[...])
# Logs to state/token_log.jsonl, enforces budget, handles caching
```

---

## 7. State model — no database needed

Everything that would normally go in Postgres lives in the control repo.

### `state/ledger.json`
```json
{
  "prs": {
    "owner/repo#123": {
      "issue_url": "https://github.com/owner/repo/issues/45",
      "pr_url": "https://github.com/owner/repo/pull/123",
      "tracking_issue": "https://github.com/me/elixpoo-ops/issues/87",
      "status": "awaiting_review",
      "opened_at": "2026-06-20T10:30:00Z",
      "last_event": "2026-06-21T14:12:00Z",
      "token_spend": 47213,
      "model_cascade": ["qwen-coder"],
      "fork_url": "https://github.com/elixpoo/repo"
    }
  },
  "blocklist": ["owner/repo", "..."],
  "daily_count": { "2026-06-20": 4 }
}
```

### `state/candidates.json`
Output of Scout. Consumed by Triage. Overwritten daily.

### `state/token_log.jsonl`
One JSON object per model call. Append-only. Summed into Gist daily.

### `state/personas.json`
*(Skipped for v1 — we run as single identity `elixpoo[bot]`.)*

### Concurrency
Workflows that mutate `state/` use Actions' `concurrency:` key to serialize. With 4–5 tasks/day, conflicts are rare.

---

## 8. GitHub App config — `elixpoo`

Register at `github.com/settings/apps/new`.

### Permissions

**On control repo (elixpoo-ops):**
- Contents: read & write
- Issues: read & write
- Pull requests: read & write
- Discussions: read & write
- Actions: read & write
- Metadata: read

**On forked target repos (under elixpoo account):**
- Contents: read & write
- Pull requests: read & write

**On upstream target repos:**
- Issues: read & write (for comments only)
- Pull requests: read & write (for opening PRs)
- Metadata: read
- *No code write access on upstreams, ever.*

### Webhook events to subscribe
- `issue_comment`
- `pull_request_review`
- `pull_request_review_comment`
- `pull_request` (for merge/close on our PRs)
- `check_suite` (for CI status on our PRs)
- `installation` (for opt-in/opt-out tracking)

### Webhook receiver
Cloudflare Worker, ~50 lines:
1. Verify HMAC signature
2. Map event → `event_type` for `repository_dispatch`
3. `POST /repos/elixpoo/elixpoo-ops/dispatches` with the payload

---

## 9. Repo layout

```
elixpoo-ops/
├── .github/
│   └── workflows/
│       ├── scout.yml
│       ├── triage.yml
│       ├── pick.yml
│       ├── solve.yml
│       ├── submit.yml
│       ├── steward-respond.yml
│       ├── steward-fix.yml
│       ├── steward-poll.yml
│       ├── celebrate.yml
│       └── daily-summary.yml
├── agents/
│   ├── scout/
│   ├── triage/
│   ├── comprehend/
│   ├── solve/
│   ├── submit/
│   └── steward/
├── rtk/
│   ├── __init__.py
│   ├── router.py
│   ├── budget.py
│   ├── compress.py
│   └── cache.py
├── prompts/
│   ├── planner.md
│   ├── implementer.md
│   ├── self_reviewer.md
│   ├── pr_body.md
│   ├── steward_respond.md
│   └── celebration.md
├── config/
│   ├── models.yaml          # role → model mapping
│   ├── languages.yaml       # whitelist + lint configs
│   └── budgets.yaml         # per-task token ceilings
├── state/
│   ├── ledger.json
│   ├── candidates.json
│   ├── rejected_issues.json
│   ├── token_log.jsonl
│   └── blocklist.json
└── README.md
```

---

## 10. Human-mimicry checklist

For every public-facing action:

- [ ] Stagger actions with realistic delays (no comment+fork+PR in 4 seconds)
- [ ] Read related issues/PRs before commenting on an issue (signals homework)
- [ ] PR body always discloses elixpoo is autonomous
- [ ] Never open more than 1 PR per repo while one is open
- [ ] If maintainer says "no AI PRs," add repo to blocklist forever
- [ ] Vary commit message style slightly (within conventional-commits format)
- [ ] If we can't solve, post graceful unclaim within 4 hours of claiming
- [ ] Respond to maintainer comments within 1 working hour (webhooks make this easy)

---

## 11. Phased build

### Phase 0 — Steward only
Hand-submit a PR to a friendly repo. Wire up webhooks. Prove the follow-up loop (respond to comments, fix on CI failure, celebrate on merge). No autonomy yet.

### Phase 1 — Scout + Triage (read-only)
Run Scout and Triage on cron. Triaged issues open in control repo, nothing posted upstream. You review the queue manually for a week.

### Phase 2 — Comprehend + Solve (on your own repos)
Add the coding squad. Point it at throwaway repos you own. Iterate on Solve until merge rate on your own repos is acceptable.

### Phase 3 — Submit, with 3–5 pre-coordinated repos
Reach out to a few maintainers, get explicit permission, let elixpoo loose on those repos only.

### Phase 4 — Expand cautiously
Open the gates to the full Scout filter. Watch merge rate. Tune the scorer.

### Phase 5 — Celebration pipeline + branding
Wire up gptimage on merge. Post to Discussions. Update public Gist.

---

## 12. Open decisions

These should be settled before scaffolding the repo:

1. **Control repo name** — `elixpoo-ops`?
2. **First-language target for Solve** — Python or TypeScript? Affects test runners and lint configs in the sandbox.
3. **Webhook receiver** — Cloudflare Worker, or pure polling via `steward-poll.yml`?
4. **Per-task token ceiling** — 100k default, 300k max — confirm or revise.
5. **Daily PR cap** — 4 or 5?
6. **RTK** — is this a specific library I should know about, or is the name yours for our token-tracking module?
7. **Gist visibility** — public daily-summary Gist yes/no?

---

## 13. Next deliverables

Once the decisions in §12 are settled:

1. Exact GitHub App creation form values (permissions, events, manifest YAML)
2. Control repo skeleton (all workflow files, `rtk/` module interface, ledger schemas)
3. First-pass prompts for planner, implementer, self-reviewer, PR body, steward responder
4. Cloudflare Worker code for the webhook ingress
5. The opt-out detection logic for Scout
