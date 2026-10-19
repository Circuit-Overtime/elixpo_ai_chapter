# Discussions squad

`agents.discussions` gives the repository an evidence-driven activity loop with
controlled variance:

- merged diffs → an energized/alert announcement, curious poll, mentoring Q&A,
  or a resting no-post decision;
- 30-minute pulse → recompute mood from unhandled merges, with a six-hour posting
  cooldown so activity stays visible without becoming noisy;
- weekly schedule → one MLOps, GitOps, Docker, or Kubernetes Q&A;
- `@elixpoo` in a discussion or discussion comment → contextual reply.

Generated Discussions are published to `elixpo/elixpo`, which must be configured
as the source repository for organization Discussions. Merge evidence still comes
from the repository that emitted the pull-request event.

Every generation uses the `discussions` RTK role (`nova-fast`, the lowest-priced
general text model in the checked-in Pollinations registry). Every title/body or
reply is then sent through the `safety` role before it can be posted. Posts carry
an autonomous-contributor disclosure and an idempotency marker.

The writer never chooses the mood or genre. `agents.discussions.mood` scores
changelogs, breaking/security language, feature paths, design signals,
configuration surfaces, domain files, documentation, diff size, and
maintenance-only changes. Genres that clear their evidence threshold enter a
weighted choice. Recent mood labels reduce the weight of repeated moods, while a
stable digest of the merge set makes workflow retries choose the same result.
Different qualifying changes can therefore produce different moods without
ignoring relevance. Critical changes always become alert announcements, and
maintenance-only changes remain quiet. Only after this decision does the routed
writer compose structured fields for the selected genre.

Python renders those fields into fixed Markdown sections and prefixes exactly one
mood emoji: 🚨 alert, 🚀 energized, 🗳️ curious, 🧭 mentoring, or 🧠 scheduled Q&A.

Runtime behavior is defined by the repo-owned skills in `skills/`:

- `merge-discussion-orchestrator` — evidence-grounded writing for the selected genre;
- `living-repo-persona` — stable teammate voice for every supplied mood;
- `technical-qna-host` — domain selection, scenario quality, and duplicate avoidance;
- `discussion-mention-responder` — grounded answers and prompt-injection boundaries;
- `github-discussion-publisher` — categories, identity, moderation, and idempotency.

The squad loads the relevant complete `SKILL.md` into each model call. The Python
publisher independently enforces the safety, disclosure, and duplicate checks.

## Repository setup

1. Enable GitHub Discussions.
2. Create categories named `Announcement` (or `Announcements`), `Q&A` (or
   `QNA`), and `Polls` in `elixpo/elixpo`.
3. Give `ELIXPOO_GITHUB_DISCUSSIONS_TOKEN` access to both `elixpo/agent.elixpo`
   and `elixpo/elixpo`, with Discussions and Issues read/write plus Pull requests
   read. Issues write is required to create and attach labels.
4. Add the Actions secret `ELIXPO_POLLINATIONS_API_KEY`. This is the only model
   provider key used by the squad.
5. Reuse `ELIXPOO_GIST_AGENTIC_TOKEN` and `ELIXPOO_FOLLOWUP_GIST_ID` for the
   revision-checked Discussion cursor and handled-source file. Grant the token
   Gists user read/write permission (or classic `gist` scope). Public reply
   markers keep polling idempotent if memory is temporarily unavailable.

The production alias check on 2026-08-09 resolved `Announcements`, `Q&A`, and
`Polls` successfully in `elixpo/elixpo`.

The workflow recomputes mood at minute 13 and 43 of each hour, runs Q&A each
Wednesday at 09:17 UTC, and exposes both through `workflow_dispatch`. The mood
pulse looks back 48 hours, aggregates up to five unhandled merges, and publishes
at most once per six hours unless the heuristic detects an alert.
`ELIXPO_DISCUSSIONS_REPOSITORY` defaults to `elixpo/elixpo` and can override the
destination for local testing.

Because Discussion events originate in `elixpo/elixpo` while this workflow lives
in `agent.elixpo`, the authoritative fallback runs every ten minutes. It scans a
round-robin page of Discussions and a round-robin page of comments per thread,
covering eligible mentions from the last 30 days. Cursors and up to 2,000 handled
source node IDs live in `elixpoo-discussions.json`; HTML markers remain a legacy
idempotency fallback. It makes no model call when no eligible mention is present,
replies to at most five mentions per run, and isolates a failed thread from the
rest of the page.

After creating a Discussion, the publisher creates missing labels and attaches `announcement`, `qna`, or
`poll`, the primary domain (`mlops`, `gitops`, `docker`, or `kubernetes`) when
applicable, the current mood label, and `elixpoo-generated`. A token without label
permission leaves the post live and records a warning instead of duplicating it.

GitHub's public GraphQL API does not expose native poll-option creation. Poll
discussions therefore publish numbered options and collect votes plus reasoning
in replies.

## Local event replay

Set `GITHUB_EVENT_PATH` to a saved webhook payload, then run one mode:

```bash
python -m agents.discussions merge
python -m agents.discussions qna
python -m agents.discussions respond
python -m agents.discussions pulse
python -m agents.discussions qna --dry-run
python -m agents.discussions pulse --dry-run
python -m agents.discussions verify-config
```

`--dry-run` is also available for a replayed merge event. It runs generation and
the safety gate and prints the exact preview without creating a post or label.

## Cadence and deterministic constraints

- Mood pulse: minute 13 and 43, using at most five merges from the last 48 hours.
- Autonomous-post cooldown: six hours; alerts may bypass it.
- Q&A: Wednesday at 09:17 UTC, subject to the same cooldown.
- Mention recovery: every ten minutes, five replies maximum per run.
- Mood variance: stable for the same merge set, weighted only among genres whose
  evidence thresholds passed, and biased away from recently repeated mood labels.
- Hard constraints: maintenance-only changes rest, critical changes announce as
  alert, every public draft passes `qwen-safety`, and idempotency markers remain stable.
