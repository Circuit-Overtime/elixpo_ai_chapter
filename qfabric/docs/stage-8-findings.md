# Stage 8 findings

Stage 8 is complete. QFabric now persists recommendations and recovery actions as immutable,
replayable policy records and renders both human-readable and machine-readable explanations from
the exact stored evidence. The final campaign and independent audit passed without new hardware
execution; they consume the audited Stage 6 input and Stage 7 rollback report.

## Accepted decision-history model

Version 1 uses an append-only newline-delimited JSON journal. Each decision stores a contiguous
numeric identifier, UTC capture time, task, decision kind, explicit policy name and version,
complete replay input, exact outcome, structured explanation facts, the previous record digest,
and its own SHA-256 digest.

The first record links to a fixed zero digest. Subsequent records form a hash chain. Readers reject
modified content, deletion or reordering inside the chain, non-contiguous identifiers, unsupported
schemas, invalid metadata, malformed JSON, and truncated tails. Writers assign identifiers under
an exclusive lock and flush plus `fsync` each append. A restarted process validates the existing
chain and continues with the next identifier.

The journal stores canonical JSON copies, so later mutation of caller-owned objects cannot alter a
decision. The stable identifier used by `qf explain --decision` is paired with the content-bearing
record digest.

## Explanation contents

Recommendation records preserve the complete Stage 6 policy input and output. Their normalized
facts distinguish local execution, communication, measured end-to-end, chain-boundary, and
predicted costs for every candidate. They also preserve contract state and evidence, semantic
eligibility, admission, MCU headroom, rejection reasons, selected domain, current domain, and all
applicable thresholds.

Recovery records preserve the policy, initial placement and epoch, and the observation prefix
needed to reproduce the exact controller step. Hardware-backed facts additionally contain the
contract window and confidence interval, execution samples, dynamic recommendation, controller
state transition, actions, cooldown, blacklist, rollback condition, protected-contract result,
and probation progress.

`qf explain add` selects the latest matching immutable record; `--decision N` selects one stable
historical record. JSON returns the structured explanation document. Text is rendered from that
same document as deterministic field paths, including every input, outcome, and fact. There is no
separate prose decision model that can silently diverge.

`qf replay --decision N` dispatches the recorded policy version over the persisted inputs and
requires exact structural equality with the stored outcome. A mismatch returns a failed replay
rather than rewriting history.

## Acceptance campaign

The final journal contains 16 records:

- five recommendation records built from controlled Stage 6 scenarios;
- nine recovery records from the real UNO Q Stage 7 rollback campaign; and
- two explicitly labelled deterministic infeasibility records.

The required explanation outcomes map to stable decision IDs:

| Explanation outcome | Decision IDs | Evidence basis |
| --- | --- | --- |
| excessive RPC/end-to-end cost | 1, 2 | controlled recommendation cases using measured costs |
| insufficient evidence | 3 | RT evidence reduced from 1,000 to 999 samples |
| failed admission | 4 | controlled destination-admission rejection |
| unsafe semantics | 5 | controlled stateful task without transition hooks |
| failed probation | 11 | real Stage 7 hardware rollback at window 6 |
| infeasibility | 15, 16 | labelled controller fault scenario and hold state |

Decision 3 withheld the recommendation because RT had 999 samples against a threshold of 1,000,
while preserving the Linux and RT measured costs and the stable `insufficient_evidence` reason.
Decision 11 replayed the real `rollback_armed` and `rollback` actions with
`target_contract_failure`, restoring Linux at the recorded epoch. Decision 15 entered
`INFEASIBLE`; decision 16 held that state without oscillation.

The campaign reopened the journal after creation, confirmed all identifiers were contiguous,
replayed every decision exactly, verified all required classifications, and checked equivalent
text and JSON facts.

## Independent audit

The final audit was captured at `2026-10-09T07:43:59.193515+00:00`. It first validated the stored
hash chain, then generated a separate expected journal from the original Stage 6 recommendation
input and Stage 7 rollback report. It compared every policy-bearing payload while excluding only
capture timestamps and their derived hashes.

All seven audit checks passed:

- hash-chain validity;
- contiguous stable identifiers;
- exact source-payload reconstruction;
- campaign-report reproducibility;
- exact replay of all 16 records;
- equivalent human and machine facts; and
- complete required-classification coverage.

The audit reported five recommendation records, eleven recovery records, and no failures. The
hardware-independent suite contained 139 passing tests at completion. Negative tests detect
modified journal content, truncated tails, tampered campaign summaries, and recovery reports that
do not reproduce before recording.

## Claim boundary and limitations

The journal is tamper-evident, not tamper-proof. An actor able to replace the entire file can
recompute its chain. Version 1 has no signature, external trust anchor, trusted time, remote
attestation, rollback protection, multi-host consensus, access-control policy, rotation, or
retention mechanism.

Replay currently supports policy version 1 through the installed QFabric implementation. Future
policy changes must retain a versioned v1 implementation or explicitly migrate records; a version
label alone cannot reproduce deleted historical code. The exhaustive field-path text format is
faithful but has not undergone operator usability testing.

The controlled recommendation and infeasibility cases validate explanations, not additional
hardware performance. Only failed probation in this campaign is directly grounded in the Stage 7
UNO Q rollback execution. Journal records may contain detailed operational evidence and grow
without bound, so deployments must define storage protection and retention before recording
sensitive or long-running workloads.

## Next stage

Stage 9 will map real QFabric telemetry and these stable decision identifiers onto the UNO Q LED
matrix and RGB devices. Visualization remains an observability interface rather than the research
novelty. Its updates must be buffered, rate-limited, disableable, and measured for overhead and
protected-contract regression.
