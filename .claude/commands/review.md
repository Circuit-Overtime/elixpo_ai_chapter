Review a PR or code change.

Focus on what needs improving, not what's already fine.

## What to look at

- **Security**: auth/authz, input validation, SQL injection, XSS, CSRF, secret exposure, rate limiting on public endpoints.
- **Edge-runtime correctness**: `export const runtime = 'edge'`, no Node built-ins, no `Buffer` misuse, no top-level `nodemailer`.
- **D1 correctness**: parameterized queries, no `RETURNING *` on multi-row, transaction boundaries, indexes on new WHERE/JOIN columns.
- **Error handling**: do errors leak D1 internals to clients? Are failures logged with enough context to debug?
- **Scope drift**: unrelated changes that should be in a separate PR.

## Don't

- Praise code that's fine.
- Repeat what the PR description already says.
- Hedge ("I think", "maybe", "might want to").
- Suggest stylistic rewrites unless they catch a real bug.
- Block on "consider adding a test" without saying what test.

## Output format

Every review body MUST end with a merge-readiness verdict line. Use this structure:

```
## Issues
- [src/path/file.ts:42] <one-line problem + why it matters>
- [src/path/file.ts:88] <same pattern>

## Suggestions
- <one-line improvement, optional>
- <another>

## Security
- <only if there's something; omit section otherwise>

---
**Merge-readiness: READY** — <one line on why>
```

The last line is the verdict. Use one of:

- `**Merge-readiness: READY**` — submit with `gh pr review --approve`
- `**Merge-readiness: NEEDS CHANGES**` — submit with `gh pr review --request-changes`
- `**Merge-readiness: BLOCKED**` — submit with `gh pr review --request-changes` and link the blocker

Bullets only. Link specific lines. Under 200 words unless the PR is genuinely large.

## One-shot-per-invocation

Within this invocation, submit EXACTLY ONE `gh pr review --approve|--request-changes|--comment --body "..."` (or ONE `gh pr comment`), then END. The command returns empty/short stdout on success — **that is success**. Do NOT retry. Do NOT submit a second review "for completeness".

Legitimate follow-ups (new code pushed, user asks for another pass) arrive as a **new** trigger event and a fresh invocation — this rule is about the current run, not the lifetime of the PR.
