Commit, push, and open a PR. Branch rules prevent accidents on main or duplicate PRs.

## Step 1 — Detect branch state

```bash
git branch --show-current
```

### If on `main`
- **NEVER commit to main.** Create a new branch first.
- For agent runs: `BRANCH="elixpo/issue-$ISSUE_N-$(openssl rand -hex 2)"`
- For human work: `feat/<slug>` or `fix/<slug>`
- `git checkout -b "$BRANCH"`, continue to Step 2.

### If on a feature branch
Check whether this branch already has an open PR:

```bash
gh pr list --head "$(git branch --show-current)" --state open --json number,url --jq '.[0]'
```

- **Open PR exists** → push to this branch (Step 2). Do NOT open another PR.
- **No open PR** → check for a merged one:
  ```bash
  gh pr list --head "$(git branch --show-current)" --state merged --json number --jq '.[0].number'
  ```
  - **Merged** → branch is stale. Cut a fresh branch from `main`:
    ```bash
    git checkout main && git pull && git checkout -b elixpo/issue-$ISSUE_N-$(openssl rand -hex 2)
    ```
    Re-apply the change there.
  - **Never had a PR** → push and open a new one (Step 3).

## Step 2 — Biome, commit, push

1. `./biome.sh` — apply fixes.
2. `./biome.sh ci` — must exit 0. If it fails, read the output, fix the errors by hand, re-run.
3. `git status` + `git diff --stat` — sanity-check what's staged.
4. `git add` specific files — avoid `.env*`, `.wrangler/`, anything under `tsconfig.tsbuildinfo`.
5. Commit with conventional format:
   ```
   feat: <concrete summary> (#<issue-n>)
   fix: <concrete summary> (#<issue-n>)
   ```
6. `git push -u origin HEAD` (first push) or `git push` (subsequent).

## Step 3 — Open PR (only if no open PR already)

```bash
gh pr create --base main --head "$(git branch --show-current)" \
  --title "[ELIXPO] <short>" \
  --body "$(cat <<'EOF'
## What this does
<2-4 sentences, user-visible outcome>

## Why
<1-2 sentences referencing the trigger or issue>

## Changes
- `<file>`: <what changed and why>
- <3-6 bullets; concrete, not vague>

## Verification
- `./biome.sh ci` clean
- <tests pass / dev-server verified / not verified — pick one>

---
Fixes #<issue-n>
EOF
)"
```

PR body rules:
- Always end with `Fixes #<n>` so GitHub auto-closes on merge.
- 3-6 bullets in Changes. No marketing. No "seamlessly", "leverages", "robust".
- For REVIEW path (no code changes): don't open a PR at all — just comment on the issue.

## Hard rules

- Never commit to `main`.
- Never `--force-push` to a shared branch.
- Never skip hooks (`--no-verify`).
- `./biome.sh ci` must exit 0 before every commit.
- One logical change per PR — keep it reviewable.
