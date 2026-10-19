# Gist custodian

`agents.gist_custodian` maintains the private Gist shared by Steward and the
Discussion fallback. It is deterministic, uses no model budget, and never posts
publicly.

Managed files are independent:

- `elixpoo-followups.json` — active Steward records and bounded completions;
- `elixpoo-merge-summaries.json` — up to 200 short public merge summaries;
- `elixpoo-model-cache.json` — up to 500 expiring, re-derivable cache values;
- `elixpoo-discussions.json` — round-robin cursors and 2,000 handled source IDs.

Every write reloads the current Gist revision and sends its ETag with `If-Match`.
A concurrent update exits with code 75 instead of overwriting newer state. The
weekly workflow prunes expired records, compacts bounded collections, creates
missing files, and writes all changed files in one PATCH.

## Operator commands

Inspect without writing:

```bash
python -m agents.gist_custodian --dry-run
```

Normal maintenance:

```bash
python -m agents.gist_custodian
```

Invalid JSON, truncation, an invalid schema, or an unknown future schema fails
closed and writes a redacted receipt to `state/gist_custodian.json`. Inspect that
receipt and the private Gist before an explicit reset:

```bash
python -m agents.gist_custodian --repair --confirm-reset
```

Repair records only the corrupt content digest and replaces only corrupted
managed files with empty current schemas. It never logs or backs up raw content.
