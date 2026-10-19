---
name: lixblogs-analytics
description: Retrieve and explain aggregate LixBlogs creator analytics through the supported CLI. Use when an agent needs personal or authorized organization performance for an explicit date range, a bounded dimension, or a JSON/CSV export without changing content or exposing visitor identifiers.
---

# LixBlogs analytics

Use `@elixpo/lixblogs-cli` 1.3.0 or newer with `--json --no-input`. Use only CLI commands; never query D1, inspect credentials, or call analytics endpoints directly.

## Access

Personal analytics requires `lixblogs:analytics:read`. Organization analytics also requires `lixblogs:organizations:read` and a current owner, admin, or maintain role.

```bash
lixblogs whoami --json --no-input
lixblogs analytics query --scope personal --range 30d --dimension overview --json --no-input
```

Use `lixblogs org list --json --no-input` before querying `--scope org:ORG_ID`. Never infer organization access from a public page or slug.

## Query

Choose one range and one dimension per request. Supported ranges are `7d`, `30d`, `90d`, `12m`, or `custom`; custom requires both ISO dates. Supported dimensions are `overview`, `timeline`, `posts`, `sources`, `devices`, and `countries`.

```bash
lixblogs analytics query --range custom --from 2026-07-01 --to 2026-07-31 \
  --dimension posts --limit 25 --json --no-input
```

Follow `meta.nextCursor` until null when all pages are required. Keep `--limit` at 100 or below. Treat an empty `values` array as valid data, not a failure.

## Explain results

- State the scope and date range first.
- Report returned facts separately from interpretations.
- Use the returned metric definitions; do not redefine a metric.
- Call out a zero previous value when describing percentage changes.
- Do not rank creators, infer sensitive traits, or attempt to identify visitors.
- Say when a collection window is incomplete or the dataset is empty.

## Export

```bash
lixblogs analytics export --scope personal --range 30d --dimension timeline \
  --format csv --output analytics.csv --json --no-input
```

Exports support JSON and CSV and refuse to overwrite an existing path. Choose a new path instead of deleting or replacing a file.

## Recovery

- `insufficient_scope`: log in again with only the missing read scope.
- `forbidden_scope`: stop; do not probe another organization identifier.
- `invalid_request`, `invalid_limit`, or `invalid_cursor`: correct the explicit query and retry once.
- `rate_limit_exceeded`: honor the server retry window.
- Preserve request IDs for diagnosis without printing tokens or credentials.

This skill performs no blog, collaborator, organization, or account mutation.
