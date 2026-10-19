# Squad state contracts

Squad payloads remain plain JSON in `state/`. A separate
`state/contracts.json` registry binds each migrated payload to a versioned
contract without breaking operator inspection or existing `jq` checks.

Each contract records:

- schema version and state filename;
- producing squad and monotonically increasing sequence;
- SHA-256 of canonical JSON;
- status, issue key, and run ID where applicable;
- production time and optional expiry.

The payload is written first and its contract second. The contract is the commit
point: a crash between writes leaves a digest mismatch that consumers reject.
Workflows must commit the payload and `state/contracts.json` together under the
shared state-writing concurrency lock.

## Boundary rules

Consumers use `StateStore.read_state()` and declare the expected producer plus
any known run ID, issue key, maximum age, or expiry. A missing contract, unknown
future schema, altered payload, stale receipt, expired receipt, or identity
mismatch raises `StateBoundaryError` before the next squad performs work.

Producers use `StateStore.write_state()`. Do not edit `contracts.json` directly,
contract it recursively, or copy a contract between payloads.

## Current migration

- Scout, Triage, Pick, Vet, Admission, Solve, Submit, Doctor, Janitor, Steward,
  Project, and Gist Custodian contract their squad outputs.
- Every cross-squad read declares an expected producer and, when available, a
  run ID, issue key, age limit, or expiry.
- Ledger and rejection receipts accept the checked-in `migration` snapshot once;
  their next normal write replaces it with the owning producer.
- Historical queue and execution snapshots are also hash-bound as `migration`,
  but active squads reject them as inputs. A fresh Scout/Vet run is required to
  begin new work.
- There is no uncontracted compatibility path: missing sidecars always fail
  closed.
