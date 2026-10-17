# Elixpo repository agent

## Workflows

- `elixpo-agent.yml` owns every scoped `@elixpoo` invocation from issues and pull requests.
- `elixpo-triage.yml` classifies new issues and pull requests, applies category, priority, and task-type metadata, and files the item on the matching Project V2 board.
- `artifact-update.yml` builds the repository snapshot consumed at the start of each run.
- `on-merge.yml` maintains the gist changelog consumed alongside that snapshot.

The retired issue and PR agent workflows must not be restored: separate listeners cause duplicate runs for issue comments attached to pull requests.

## Organization secrets

Configure these as organization-level Actions secrets and grant them to every
repository that installs the agent workflows:

| Secret | Purpose | Required access |
| --- | --- | --- |
| `ELIXPO_POLLINATIONS_API_KEY` | Every model request: agent, triage, PR metadata, and changelog summaries | Pollinations text API; this is the only model credential |
| `ELIXPOO_GITHUB_AGENTIC_TOKEN` | Repository reads/writes, issue and PR metadata, branches, failed-run retries, repository variables, and Project V2 fields | See the token profiles below |
| `ELIXPOO_GITHUB_NOTIFICATIONS_TOKEN` | Optional discovery of mentions outside repositories with installed webhooks | Classic PAT with `notifications`; fine-grained PATs are unsupported by this endpoint |
| `AGENT_GITHUB_SOLVER_TOKEN` | Solve/Submit fork creation, fork branch pushes, and pull-request creation | Classic PAT from the fork owner with `public_repo` for public targets |
| `ELIXPOO_GIST_AGENTIC_TOKEN` | Merge changelog and Steward follow-up memory | Gist read/write |

`GITHUB_TOKEN` is created automatically for each workflow run. It is not an
organization secret and must not be copied into organization settings.

CCR creates all model routes with
`ELIXPO_POLLINATIONS_API_KEY`. Do not create per-model or per-provider
keys. Repository-specific deployment, package publishing, payment, and
moderation secrets are unrelated to the agent and remain scoped only to repos
whose workflows use them.

### Token profiles

Recommended `ELIXPOO_GITHUB_AGENTIC_TOKEN` fine-grained PAT:

- Token owner: the human `elixpoo` account. State-writing workflows use this
  credential for pushes so GitHub records `elixpoo`, not `github-actions[bot]`,
  as the authenticated pusher.
- Resource owner: `elixpo`; repository access: every repository using the agent.
- Repository permissions: Actions read/write, Contents read/write, Issues
  read/write, Pull requests read/write, Variables read/write, Workflows
  read/write, and Metadata read.
- Organization permissions: Projects read/write.
Classic PAT fallback for `ELIXPOO_GITHUB_AGENTIC_TOKEN`: `repo`, `workflow`, and `project`.
Add `read:org` only if the organization restricts project access in a
way that requires membership lookup. This is broader than the fine-grained
profile.

The commit identity is `elixpoo <elixpoo@gmail.com>`. Keep that email verified
on the `elixpoo` GitHub account or replace it everywhere with the account's
GitHub-provided private noreply address; an unverified email will not link the
commit to the profile.

`ELIXPOO_GIST_AGENTIC_TOKEN` needs either the fine-grained Gists user permission
set to read/write or the classic PAT scope `gist`. It does not need `repo`,
`workflow`, or organization administration scopes. An optional
`ELIXPOO_GITHUB_NOTIFICATIONS_TOKEN` must be a classic PAT with the
`notifications` scope; GitHub rejects fine-grained tokens for that endpoint.

Set the organization variable `ELIXPOO_FOLLOWUP_GIST_ID` to one private Gist
owned by `elixpoo`. Steward stores `elixpoo-followups.json` beside any other
Gist files; it never overwrites the merge changelog. Optionally set
`ELIXPO_FOLLOWUP_TTL_DAYS` from 60 through 360 (default 360). Set
`ELIXPO_GITHUB_CONTROL_REPO` to the
`owner/repository` containing the squad workflows when Steward runs anywhere
other than that control repository; Actions otherwise uses `GITHUB_REPOSITORY`.
`ELIXPO_AGENT_MAX_TURNS` is retired: the repository responder no longer runs a
coding tool loop.

`AGENT_GITHUB_SOLVER_TOKEN` is deliberately separate from the general
agentic token. Mint it from the account that owns the forks. Use classic scope
`public_repo` for public targets; add private-repository access only if private
targets are explicitly enabled. Solve and Submit never fall back to another
GitHub credential.

`ELIXPO_POLLINATIONS_API_KEY` is not a GitHub token and receives no
GitHub permissions. Give it only Pollinations text-generation access.

Use expirations and rotation reminders on both PATs. Organization secret
visibility should be limited to selected agent-enabled repositories until the
workflow is rolled out everywhere.

### Portable repository baseline

For another Elixpo repository, use the canonical bundle in
`config/org_standard.yaml`. `python -m agents.standard_sync` reports drift;
`--apply` opens one reviewable update PR per repository. Do not manually copy
individual workflow files because that recreates version drift.

Required organization secrets:

- `ELIXPO_POLLINATIONS_API_KEY`
- `ELIXPOO_GITHUB_AGENTIC_TOKEN`
- `AGENT_GITHUB_SOLVER_TOKEN`
- `ELIXPOO_GIST_AGENTIC_TOKEN`

No `GH_SECRET` is required. GitHub supplies `GITHUB_TOKEN` automatically, while
cross-repository and Project V2 operations use
`ELIXPOO_GITHUB_AGENTIC_TOKEN`.

No SOPS/age key is required by the agent stack. If a repository separately
decrypts deployment configuration, keep that key in a deployment environment
secret and expose it only to the deployment job as `SOPS_AGE_KEY`. Never pass
an age private key to the repository agent, triage, acknowledgement, retry, or
changelog jobs.

`CI_GIST_ID` is a repository Actions variable, not a secret. It may start
unset; `on-merge.yml` creates a changelog gist on the first merge and persists
the resulting ID for later runs.

### Other secrets referenced only by this repository

These are not part of the organization agent bundle:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: production deployment.
- `ELIXPO_PAY_API_KEY`: payout catalog and deployment configuration.
- `MODERATION_SECRET`: moderation workflow authentication.
- `NPM_LIXEDITOR_PUBLISH_TOKEN`: npm publishing.
- `VSCODE_LIXSKETCH_EXT_PUBLISH_TOKEN`: VS Code Marketplace publishing.

## Cost-aware routes

| Route | Model | Use |
| --- | --- | --- |
| repository_agent | `nova-fast` | bounded issue replies, PR review, and OreoFlow routing |
| code | `qwen-coder` | Solve and Steward Fix coding only |
| webSearch | `perplexity-fast` | time-sensitive external lookup only |

Token ceilings are centralized in `.github/ci_config.py`. The prompt directs the agent to read the prepared context once, use targeted repository reads, and avoid search unless local context is insufficient. RTK compresses supported shell output before it reaches the model.

The repository responder receives bounded issue context or at most 12,000
characters of PR diff. It makes one `repository_agent` call and one safety call,
with a 16,000-token soft budget and 20,000-token ceiling. It has no file, shell,
branch, or metadata tools. Implementation requests enter OreoFlow Vet; Solve is
the only CCR coding harness and remains supervised by Doctor and Janitor.

Steward polls the elixpoo account's participating mention notifications every
ten minutes. This catches public issue and PR mentions outside repositories that
host the portable workflow. A new thread receives a Gist intake record and a
safety-gated response; repository-changing work still enters the normal
grounded repository workflow. A structured Steward decision dispatches only an
explicit issue implementation request. The serialized intake workflow checks
the blocklist, daily cap, active repository work, and Pick/Vet slot, then sends
the issue through Vet before Solve can fork or edit anything. Submitted PRs are
registered from the Solve and Submit state receipts, then removed from active
memory immediately on merge or close, or on TTL expiry. A bounded completion
tracker retains the outcome.

GitHub Discussion mentions are handled both by direct `discussion` and
`discussion_comment` events and by the existing ten-minute target-repository
poll, which covers webhook gaps and nested replies.

CCR configuration applies only to the bounded Solve coding harness.

## Scope and safety

- Only configured organization members can invoke the workflow.
- An issue invocation may answer, edit metadata, inspect a linked PR, update its writable branch, or open one linked PR.
- A pull-request invocation may answer, edit metadata, review, or update the existing same-repository head branch.
- Fork PRs are read-only.
- The agent cannot push `main`, force-push, merge, expose secrets, or act in another repository.
- Per-item concurrency prevents simultaneous runs from racing on one issue or pull request.
