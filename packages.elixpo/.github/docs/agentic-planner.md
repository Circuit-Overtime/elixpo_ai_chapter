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
| `ELIXPOO_GIST_AGENTIC_TOKEN` | Shared reusable `merge-gist.yml` workflow in `agent.elixpo` | Gist read/write |

`GITHUB_TOKEN` is created automatically for each workflow run. It is not an
organization secret and must not be copied into organization settings.

CCR creates all model routes with
`ELIXPO_POLLINATIONS_API_KEY`. Do not create per-model or per-provider
keys. Repository-specific deployment, package publishing, payment, and
moderation secrets are unrelated to the agent and remain scoped only to repos
whose workflows use them.

### Token profiles

Recommended `ELIXPOO_GITHUB_AGENTIC_TOKEN` fine-grained PAT:

- Resource owner: `elixpo`; repository access: every repository using the agent.
- Repository permissions: Actions read/write, Contents read/write, Issues
  read/write, Pull requests read/write, Variables read/write, Workflows
  read/write, and Metadata read.
- Organization permissions: Projects read/write.
Classic PAT fallback for `ELIXPOO_GITHUB_AGENTIC_TOKEN`: `repo`, `workflow`, and `project`.
Add `read:org` only if the organization restricts project access in a
way that requires membership lookup. This is broader than the fine-grained
profile.

`ELIXPOO_GIST_AGENTIC_TOKEN` needs only classic PAT scope `gist`. It does not need `repo`,
`workflow`, or organization administration scopes.

`ELIXPO_POLLINATIONS_API_KEY` is not a GitHub token and receives no
GitHub permissions. Give it only Pollinations text-generation access.

Use expirations and rotation reminders on both PATs. Organization secret
visibility should be limited to selected agent-enabled repositories until the
workflow is rolled out everywhere.

### Portable repository baseline

For another Elixpo repository, copy the agent workflows, supporting scripts,
`ci_config.py`, and this document. Then customize only the repository identity,
description, core paths, maintainers, and project mappings in `ci_config.py`.

Required organization secrets:

- `ELIXPO_POLLINATIONS_API_KEY`
- `ELIXPOO_GITHUB_AGENTIC_TOKEN`
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
| default | `deepseek` | repository changes, review, and scoped tool use |
| background | `nova-fast` | inexpensive metadata and supporting work |
| think | `deepseek` | complex reasoning or review only |
| webSearch | `perplexity-fast` | time-sensitive external lookup only |

Token ceilings are centralized in `.github/ci_config.py`. The prompt directs the agent to read the prepared context once, use targeted repository reads, and avoid search unless local context is insufficient. RTK compresses supported shell output before it reaches the model.

PR context is bounded to metadata, diff statistics, and changed-file names. The agent requests per-file diffs only when needed; the workflow never injects the full patch. Agent execution is capped at 32 turns and 12 minutes, with prompt-level budgets of 12 tool calls for questions/reviews and 30 for implementation.

The setup script also maps the harness's Sonnet, Opus, and Haiku aliases to these configured free models. This prevents the upstream API from receiving an unavailable Anthropic model name after CCR has selected a Pollinations provider.

## Scope and safety

- Only configured organization members can invoke the workflow.
- An issue invocation may answer, edit metadata, inspect a linked PR, update its writable branch, or open one linked PR.
- A pull-request invocation may answer, edit metadata, review, or update the existing same-repository head branch.
- Fork PRs are read-only.
- The agent cannot push `main`, force-push, merge, expose secrets, or act in another repository.
- Per-item concurrency prevents simultaneous runs from racing on one issue or pull request.
