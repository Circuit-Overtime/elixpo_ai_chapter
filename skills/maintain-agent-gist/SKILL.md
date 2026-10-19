---
name: maintain-agent-gist
description: Maintain revision-checked private Gist files used by elixpoo for follow-up memory, bounded merge summaries, and re-derivable model cache entries. Use when pruning TTLs, compacting receipts, migrating schemas, inspecting corruption, resolving concurrent-write conflicts, or performing an explicitly confirmed manual repair.
---

# Maintain agent Gist

Treat the Gist as bounded shared memory, never as the source of truth. GitHub
subjects, the Project board, and committed state remain authoritative.

## Normal maintenance

1. Fetch one snapshot and retain its revision and ETag.
2. Parse each managed file independently.
3. Validate its typed schema before changing it.
4. Prune expired follow-ups and cache entries.
5. Deduplicate and cap completed receipts, handled IDs, summaries, and cache keys.
6. Write changed files together only if the Gist still matches the read revision.
7. On conflict, stop with a retryable receipt. Never merge stale local memory over a newer revision.

Keep `elixpoo-followups.json`, `elixpoo-merge-summaries.json`, and
`elixpoo-model-cache.json` separate even when they share one Gist. Keep
Discussion cursors and handled source IDs in `elixpoo-discussions.json`.

## Corruption and repair

- Fail closed when a managed file is truncated, invalid JSON, or fails schema validation.
- Record only its filename, error category, and SHA-256 digest in the local receipt.
- Never print or copy corrupted content into logs or another file.
- Require both `--repair` and `--confirm-reset` to replace a corrupted file with its empty current schema.
- Do not reset healthy sibling files while repairing one file.

## Data boundary

Store public identifiers, bounded status metadata, short summaries, hashes, and
re-derivable cache values only. Never store credentials, authorization headers,
repository source, patches, hidden instructions, prompts, tool transcripts, or
raw model context. Do not make model calls or public GitHub posts.
