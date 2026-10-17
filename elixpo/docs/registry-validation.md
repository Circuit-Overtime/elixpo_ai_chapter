# Canonical registry validation

The `content/` directory is Elixpo's canonical organization registry. Every
top-level JSON record declares a Draft 2020-12 schema through its `$schema`
property. `brand/provenance.json` follows the same contract for imported brand
masters.

Run the complete check with:

```bash
npm run registry:check
```

## What the check enforces

The validator performs two layers of validation:

1. **JSON Schema validation** checks required fields, types, enumerations,
   formats, patterns, conditional requirements, unknown properties, and nested
   records against each document's declared schema.
2. **Cross-record validation** checks relationships that one schema cannot see,
   including unique slugs and identifiers, directory coverage, lifecycle and
   taxonomy membership, package relationships, research-directory alignment,
   contributor evidence indexes, brand provenance totals, and policy invariants.

Normal validation also requires verification dates to be no more than 183 days
old and rejects dates more than one day in the future. Repository-level status
dates follow the same rule. Root-relative icons and package artwork must resolve
to real files under `public/`; paths cannot escape that directory.

The command fails if a new top-level `content/*.json` record is not included in
the schema-validation set. This prevents a registry file from silently bypassing
CI merely because its schema was forgotten.

## Changing a record

1. Update the canonical JSON record.
2. Update its schema when the content contract genuinely changes.
3. Run `npm run registry:check` and correct the record or schema; do not weaken a
   constraint only to silence an unexplained failure.
4. Regenerate dependent READMEs when shared organization facts changed.
5. Review the site output and commit the record, schema, generated artifacts,
   and implementation together.

Schemas describe the shape of a record. Handwritten cross-record checks remain
necessary for claims such as “this project exists in the public repository
inventory” or “this evidence index points to a real URL in the same contributor
record.” Both layers are required in CI.

## External link health

External availability is checked separately because rate limits, authentication,
bot protection, and transient upstream failures must not make every content pull
request flaky:

```bash
npm run registry:links
```

The checker deduplicates HTTP(S) URLs from every canonical record, follows
redirects, and retries servers that reject `HEAD` with a minimal ranged `GET`.
Confirmed `404 Not Found` and `410 Gone` responses fail the command. Protected,
rate-limited, timed-out, or temporarily failing endpoints produce visible
warnings for human review. Exact organization URLs explicitly marked `planned`
are reported but not requested; links beneath those future hosts are still
checked so a planned root cannot conceal a falsely published resource. A
scheduled GitHub Actions job runs this audit every Monday and it can also be
dispatched manually.

Use `ELIXPO_LINK_TIMEOUT_MS` and `ELIXPO_LINK_CHECK_CONCURRENCY` only to tune the
network run; they do not change which status codes are considered confirmed dead
links.

## Project manifests

`content/schemas/project-manifest.schema.json` defines the contract used by
individual repository manifests. It is a reusable input schema rather than a
top-level canonical registry record, so the portal validator does not expect a
single corresponding JSON file under `content/`. Repository conformance is
checked separately with `npm run repository:check`.

The canonical repository inventory also publishes the current Standard 1.0
assessment. It distinguishes conformant repositories, reviewed exceptions,
the deferred agent stack, deliberately out-of-scope support or external
repositories, and centrally recorded archives. Validation rejects missing or
duplicate assessment membership so a repository cannot silently disappear from
the rollout record.
