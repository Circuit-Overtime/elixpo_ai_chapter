Respond to an issue triggered by `@elixpoo` mention or the `ELIXPO` label.

## Step 1 — Load context

- Read `.elixpo-context/context.md` ONCE. Don't `ls`/`find`/`tree` to rediscover what's there.
- `gh issue view <n> --comments` ONCE. Don't repeat with different `--json` flags.
- Do NOT re-read README.md or CLAUDE.md unless the context snippet is truncated.

## Step 2 — Classify the request

Look at what the user actually asked. Pick ONE:

- **QUESTION / DISCUSSION / LGTM** — user wants an answer, not a code change.
  → Go to Step 3 (answer path).
- **IMPLEMENTATION** — user asked for a fix, feature, refactor, or any code change.
  → Go to Step 4 (implement path).
- **UNCLEAR** — the ask is too vague to act on (missing scope, conflicting requirements).
  → Go to Step 5 (clarify path).

## Step 3 — Answer path

Post ONE comment on the issue. That's it. No branch, no PR.

```bash
gh issue comment <n> --body "<your answer>"
```

**Within this invocation, stop after one successful comment.** The command returns empty/short stdout on success — that IS success. Do NOT retry, do NOT post a second comment "to add more", do NOT follow up with another `gh` call. If the user wants more, they'll ping `@elixpoo` again — each new trigger is a fresh invocation.

Answer rules:
- Bullets over paragraphs. <150 words.
- Link specific files/lines (`src/lib/jwt.ts:42`) instead of describing.
- No "I think" / "maybe". Either it's true or it's not.
- If the question has a definitive answer in AGENTS.md or the code, quote/link it.

## Step 4 — Implement path

Before touching code, check for an existing linked PR:

```bash
gh pr list --search "linked:issue-<n>" --state open --json number,headRefName,title
```

### 4a. Open PR exists
Someone (possibly you, earlier) already has a PR open for this issue.
- `git fetch origin && git checkout <headRefName> && git pull`
- Make changes on that branch.
- Follow `.claude/commands/commit-push-pr.md` Step 2 (commit + push). **Do NOT open a new PR.**
- Comment on the issue: `pushed more changes to #<pr-n>`.

### 4b. Merged PR exists (no open one)
Prior attempt merged. Cut a fresh branch.
- `git pr diff <merged-pr>` — read the old diff for context.
- New branch: `elixpo/issue-<n>-$(openssl rand -hex 2)`.
- In the PR body add a line: `Supersedes #<merged-pr>.`
- Follow `commit-push-pr.md` Steps 2-3.

### 4c. No PR exists
Standard flow. Follow `.claude/commands/commit-push-pr.md` end-to-end.

### Implementation rules (all sub-paths)
- Minimal, scoped edits. No unrelated cleanups.
- Follow existing conventions (biome, tsconfig, neighbouring code style).
- `./biome.sh ci` must exit 0 before commit.
- Edge runtime: `export const runtime = 'edge'` on any new API route.
- For any auth/OAuth/RBAC change, re-read `src/lib/api-auth-middleware.ts` and `src/lib/rbac-middleware.ts` before editing.

## Step 5 — Clarify path

Post one comment with the minimum questions you need answered. Then STOP.

```bash
gh issue comment <n> --body "@<reporter> a few things to clarify before I start:
- <question 1>
- <question 2>
Reply here and tag @elixpoo so I pick it up."
```

Do NOT open a branch. Do NOT open a PR. Wait for the user to re-engage.

## Hard rules

- Never commit to `main`.
- One tracking comment — don't spam new comments between checkpoints. Edit the existing one.
- Never say "Claude", "AI", "LLM", "analyzing". Speak as a teammate.
- Stay strictly in scope. No side quests into other repos.
