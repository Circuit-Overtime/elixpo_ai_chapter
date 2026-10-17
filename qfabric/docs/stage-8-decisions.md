# Stage 8 immutable decision history

Stage 8 makes QFabric recommendations and recovery actions inspectable from the exact evidence
used by the policy engine. Explanations and replay are derived from persisted decision records,
not reconstructed from mutable current state or free-form log text.

## Journal integrity model

Version 1 stores newline-delimited JSON in an append-only decision journal. Every record contains:

- a contiguous positive `decision_id`, used by `qf explain --decision` and `qf replay`;
- a UTC capture time, task, decision kind, and explicit policy name and version;
- the complete policy input required for deterministic replay;
- the exact policy outcome and structured explanation facts;
- the SHA-256 of the preceding record; and
- a SHA-256 over every field except the digest itself.

The first record links to a fixed all-zero genesis digest. Later records form a hash chain, so
editing, deleting, inserting, or reordering a line is detected when the journal is read. IDs are
assigned while holding an exclusive file lock, and each append is flushed and synchronized before
the lock is released. Readers validate the complete chain under a shared lock.

The journal is tamper-evident, not tamper-proof: an actor able to rewrite the entire file could
recompute every digest. Version 1 does not claim cryptographic identity, signatures, secure time,
or protection against rollback to an older valid journal. Those require an external trust anchor.

## Persistence semantics

Decision input, outcome, and facts are converted through canonical JSON before append, separating
the stored value from caller-owned mutable objects. Restarting the process opens and validates the
same journal, retains existing identifiers, and allocates the next contiguous ID. A malformed or
truncated tail is rejected rather than silently discarded.

The journal contains policy evidence and may grow without bound. Rotation, retention, access
control, redaction, and multi-host replication are outside the version 1 scope and must be defined
before recording sensitive or long-running deployments.

## Recording decisions

Record one Stage 6 recommendation from its complete policy input:

```bash
qf history recommendation \
  --input data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --task add \
  --store data/processed/stage8/decisions.jsonl
```

Import every controller step from an independently replayable Stage 7 hardware report:

```bash
qf history recovery \
  --input data/processed/stage7/hardware-success.json \
  --recommendation-input \
  data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --store data/processed/stage8/decisions.jsonl
```

The importer replays the complete recovery report before appending anything. Each persisted
recovery decision contains the policy, initial placement and epoch, and observation prefix needed
to reproduce that exact controller step. Structured facts also preserve its contract definition,
sample window and confidence interval, candidate costs, communication and chain costs, semantic
and admission gates, MCU headroom, cooldown and blacklist values, rollback reason, and post-switch
probation result.

## Explain and replay

The required interfaces read only validated immutable records:

```bash
qf explain add --history data/processed/stage8/decisions.jsonl
qf explain add --decision 1 --history data/processed/stage8/decisions.jsonl
qf replay --decision 1 --history data/processed/stage8/decisions.jsonl
```

Add `--json` to `explain` or `replay` for machine-readable output. The human explanation is
generated from the same structured explanation document and renders every input, outcome, and
fact as a deterministic field path; it does not maintain a separate prose interpretation that
could drift from the JSON view.

Replay invokes the recorded policy version over the stored inputs and requires exact structural
equality with the recorded outcome. Recommendation replay covers the complete filtered Stage 6
report. Recovery replay covers the policy state after every stored observation prefix, including
the exact action, domain, epoch, probation, rollback, cooldown, and blacklist state.

## Outcome-coverage campaign

Build a fresh acceptance journal from the audited Stage 6 input and Stage 7 rollback campaign:

```bash
qf history campaign \
  --recommendation-input \
  data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --rollback-report data/processed/stage7/hardware-rollback.json \
  --store data/processed/stage8/decisions.jsonl \
  --output data/processed/stage8/decision-campaign.json
```

The destination journal must be empty. The campaign records five recommendation cases, all nine
hardware rollback steps, and two explicitly labelled deterministic infeasibility steps. It then
reopens the journal, validates its hash chain and contiguous identifiers, replays every record,
and checks that the human rendering carries every machine-readable input, outcome, and explanation
fact.

Acceptance requires stable records covering `insufficient_evidence`, `unsafe_semantics`,
`failed_admission`, `excessive_rpc_cost`, `failed_probation`, and `infeasibility`. The synthetic
recommendation mutations and infeasibility trace validate policy explanations; they are not
additional hardware-performance observations. Failed probation remains grounded in the real
Stage 7 rollback campaign.

## Independent audit

Run the final reproducibility gate over the persisted journal and campaign report:

```bash
qf history audit \
  --store data/processed/stage8/decisions.jsonl \
  --campaign data/processed/stage8/decision-campaign.json \
  --recommendation-input \
  data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --rollback-report data/processed/stage7/hardware-rollback.json \
  --output data/processed/stage8/stage8-audit.json
```

The audit first validates the persisted hash chain. It then regenerates a separate expected
journal from the Stage 6 and Stage 7 sources and compares every policy-bearing payload while
excluding only capture timestamps and the hashes derived from them. It independently replays all
decisions, checks the campaign summary, requires policy version 1, validates contiguous IDs and
all six explanation classifications, and confirms that text and JSON expose the same recorded
input, outcome, and structured facts.
