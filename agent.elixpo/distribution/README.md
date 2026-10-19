# Elixpoo v2 repository callers

Copy the four files in `distribution/workflows/` to a participating repository's
`.github/workflows/` directory. They contain triggers and least-privilege job
permissions only; all Python runtime code remains centralized here.

The callers pin reusable workflows to the protected `v2` release ref. Release a
tested runtime, move the protected `v2` tag to that release according to the
maintainer release procedure, and run the rollout audit before merging caller
updates. Repositories may instead pin an immutable commit SHA for stricter
change control.

Required organization/repository secrets:

- `ELIXPOO_GITHUB_AGENTIC_TOKEN`: GitHub App installation token or fine-grained
  token with Metadata read, Contents read, Issues write, and Pull requests write.
- `ELIXPO_POLLINATIONS_API_KEY`: model routing and safety.
- `ELIXPOO_GIST_AGENTIC_TOKEN`: Gists write plus repository metadata/read for
  merge memory.
- `ELIXPOO_FOLLOWUP_GIST_ID`: approved organization-context Gist identifier.
- `ELIXPOO_GITHUB_PROJECT_TOKEN`: Projects read/write and repository metadata
  read. Set `ELIXPO_GITHUB_PROJECT_OWNER` and `ELIXPO_GITHUB_PROJECT_NUMBER`
  as repository or organization variables.

Never add `pull_request_target`; reviews inspect API evidence and never check out
or execute contributor code.

## Central rollout

The control repository can prepare the same reviewable change without copying
runtime code or cloning target repositories:

```bash
python -m agents.rollout_prs
python -m agents.rollout_prs --repo lixrl.com --apply
```

Dry-run is the default. `--apply` creates an idempotent branch and pull request
through the GitHub API. The `Elixpoo v2 rollout PRs` workflow exposes the same
operation through `workflow_dispatch`; it never merges the target pull request.
Set `ELIXPOO_GITHUB_ROLLOUT_TOKEN` only in the control repository. Use a GitHub
App installation token or fine-grained token covering the target repositories
with Metadata read, Contents read/write, and Pull requests read/write. A classic
token also needs `workflow` to create files under `.github/workflows/`.
