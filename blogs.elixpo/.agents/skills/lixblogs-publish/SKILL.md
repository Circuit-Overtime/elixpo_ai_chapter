---
name: lixblogs-publish
description: Safely preview, publish, unpublish, trash, restore, or permanently delete LixBlogs posts through the supported CLI. Use when an agent is asked to change a post's public or deletion state and must enforce explicit approval, revision checks, and recovery guidance.
---

# LixBlogs publish

Use `@elixpo/lixblogs-cli` 1.2.0 or newer with `--json --no-input`. Never use D1, cookies, raw tokens, or direct HTTP calls.

## Access and approval

| Action | Scope | Consequence |
| --- | --- | --- |
| Preview | `lixblogs:blog:read` | No state change |
| Publish / unpublish | `lixblogs:blog:publish` | Adds or removes public access |
| Trash / restore | `lixblogs:blog:delete` | Hides or recovers content |
| Permanent delete | `lixblogs:blog:delete:permanent` | Irreversible removal |

Before a state change, state the target, current state, intended state, and consequence. Obtain explicit user approval. A prior request to draft or edit is not approval to publish or delete. Pass `--yes` only after approval.

## Procedure

1. Verify identity and scopes with `lixblogs whoami --json --no-input`.
2. Inspect the latest state and ETag:

```bash
lixblogs blog preview BLOG_ID --json --no-input
```

3. Preflight the exact operation with `--dry-run`.
4. Show the consequence and ask for approval if it is not already explicit.
5. Execute once with `--yes`, `--etag ETAG`, and a stable `--idempotency-key` where accepted.
6. Report the returned canonical URL and ETag. Fetch once to verify the final state.

```bash
lixblogs blog publish BLOG_ID --etag ETAG --idempotency-key KEY --dry-run --json --no-input
lixblogs blog publish BLOG_ID --etag ETAG --idempotency-key KEY --yes --json --no-input
lixblogs blog publish BLOG_ID --status unlisted --etag ETAG --idempotency-key KEY --yes --json --no-input
lixblogs blog unpublish BLOG_ID --etag ETAG --yes --json --no-input
lixblogs blog trash BLOG_ID --etag ETAG --yes --json --no-input
lixblogs blog restore BLOG_ID --etag ETAG --yes --json --no-input
lixblogs blog delete BLOG_ID --etag ETAG --permanent --yes --json --no-input
```

Trash is the default deletion behavior. Never add `--permanent` unless the user explicitly asks for irreversible deletion after seeing that consequence.

## Conflicts and recovery

- Exit `3` / `revision_conflict`: stop. Fetch the current post, explain that it changed, and request a new decision; never force the stale transition.
- Exit `5` / `confirmation_required`: obtain explicit approval; do not silently retry.
- `idempotency_in_progress`: wait for the original request result before retrying with the same key.
- `idempotency_key_reused`: create a new key only for a genuinely new operation.
- Authentication or missing-scope errors: request only the named scope.
- If the response has a request ID, include it in the failure report. Never print credentials.

Use `lixblogs-author` for content changes before returning to this procedure.
