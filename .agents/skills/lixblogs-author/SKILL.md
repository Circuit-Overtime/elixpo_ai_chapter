---
name: lixblogs-author
description: Draft, inspect, and revise LixBlogs posts through the supported CLI. Use when an agent needs to outline a post, create a draft, update Markdown or metadata, or resolve an edit conflict without publishing or deleting content.
---

# LixBlogs author

Use `@elixpo/lixblogs-cli` 1.5.8 or newer. Run every automation command with `--json --no-input`. Never use D1, session cookies, passwords, bearer tokens, or direct API calls.

## Access

- Inspect: `lixblogs:profile:read`, `lixblogs:blog:read`
- Draft or revise: add `lixblogs:blog:write`
- Do not request publish, delete, organization-write, or collaboration-write scopes for this workflow.

Check the active identity before writing:

```bash
lixblogs whoami --json --no-input
```

If a scope is missing, stop and tell the user which scope is required. Do not initiate login without their involvement.

## Workflow

1. Inspect existing work with `lixblogs blog list --status draft --json --no-input` or `lixblogs blog get BLOG_ID --json --no-input`.
2. Preserve the creator's claims, citations, tone, headings, and code. Mark unsupported facts for review; do not invent them.
3. Prefer a Markdown file for substantial content. Use stdin for a generated pipeline and `--editor` only for a human-controlled terminal.
4. Validate the intended write with `--dry-run`.
5. Write the draft, then fetch it once to verify the stored result.

```bash
lixblogs blog create --file post.md --title "Title" --tag topic --dry-run --json --no-input
lixblogs blog create --file post.md --title "Title" --tag topic --json --no-input
lixblogs blog edit BLOG_ID --file post.md --dry-run --json --no-input
lixblogs blog edit BLOG_ID --file post.md --json --no-input
```

Metadata-only revisions use `--title`, `--subtitle`, `--slug`, repeatable `--tag`, `--emoji`, `--cover`, `--cover-x`, `--cover-y`, `--cover-zoom`, `--publication`, `--collection`, `--member-only` / `--no-member-only`, `--allow-comments` / `--no-comments`, and `--secret` / `--not-secret`. Content inputs `--file`, `--stdin`, `--content`, and `--editor` are mutually exclusive.

Use `lixblogs blog history BLOG_ID` to list snapshots. Inspect the exact content before proposing a restore with `lixblogs blog history BLOG_ID --version VERSION_ID`; restore with `lixblogs blog restore-version BLOG_ID --version VERSION_ID --yes` only after explicit approval. Use the separate `lixblogs-media` skill for uploads or billable Pollinations generation.

## Recovery

- Exit `2`: correct command syntax; never guess a flag.
- Exit `3` / `revision_conflict`: read `details.localPath` and `details.serverPath`, preserve both authors' changes, obtain creator approval for ambiguous merges, then retry with `--etag details.serverEtag`.
- Exit `4` / authentication or scope failure: stop and request the named login/scope action.
- A request ID in an error is diagnostic metadata; report it without exposing credentials.

This skill ends at a reviewed draft. Use the separate `lixblogs-publish` skill for any public-state change.
