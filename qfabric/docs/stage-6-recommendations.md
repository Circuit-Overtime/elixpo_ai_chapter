# Stage 6 static recommendation policy

Stage 6 recommends an execution domain from measured evidence. It is strictly advisory: generating
a recommendation never invokes a task, changes placement, deploys firmware, or mutates runtime
state.

The completed recommendation evidence and limitations are recorded in the
[Stage 6 findings](stage-6-findings.md).

## Policy boundary

The `gated-static-end-to-end-v1` policy compares Linux and RT using measured p95 end-to-end
latency. Local execution time is reported for explanation and MCU utilization, but it is never
substituted for the complete serialization, Bridge, queueing, and execution path.

Every candidate is evaluated against these hard gates:

1. both domains have the policy's minimum evidence, otherwise the recommendation is withheld;
2. a cross-domain transition is semantically eligible;
3. the destination admission controller allows the domain;
4. the Stage 5 contract state is `SATISFIED`;
5. observed miss rate does not exceed the contract;
6. predicted p95 including supported chain-boundary costs does not exceed the deadline;
7. a cross-domain move is outside cooldown; and
8. RT placement preserves the declared MCU headroom.

The current domain is always semantically eligible. A different domain is automatically eligible
only for a `Q_PURE` task; other effects require explicit transition hooks. Admission and cooldown
remain separate gates so their rejection reasons cannot be confused with semantic safety.

After the hard gates, the lowest predicted end-to-end latency wins. Equal predictions use a stable
domain-name ordering. Every admissible but slower alternative receives
`higher_predicted_end_to_end`; every hard-gate rejection retains its specific evidence and reason
code.

## Chain and capacity accounting

For a supported task chain, each adjacent task or data location declares its current domain and a
measured boundary cost. A candidate pays that cost when its domain differs from the neighbor:

```text
predicted_end_to_end = measured_candidate_p95 + charged_chain_boundaries
```

This makes a Linux-to-RT-to-Linux placement pay both supported boundaries and prevents an apparent
standalone saving from creating obvious domain ping-pong.

MCU utilization is predicted as:

```text
task_utilization_pct = rate_hz * mcu_local_execution_p95_ns / 1e9 * 100
projected_pct = utilization_without_task_pct + task_utilization_pct
usable_pct = 100 - reserved_headroom_pct
```

RT is rejected when projected utilization exceeds usable capacity. Reports always expose the base,
task, projected, reserved, and usable percentages.

## Interface and deterministic output

Derive the evidence fields from the audited Stage 5 campaign and the canonical ABI declaration:

```bash
qf recommend-input \
  --stage5-root data/processed/stage5/stage5-contracts-01 \
  --abi config/qfabric-abi.json \
  --operations config/stage6-operations.json \
  --output data/processed/stage6/recommendation-input.json
```

The builder imports p95 end-to-end and local execution measurements from the full profiles,
evidence counts and observed misses from the contract reports, and effect class plus transition
hooks from the ABI. It rejects mismatched Linux/RT contracts and ambiguous profile groups.
Admission, current placement, cooldown, managed-task rate, reserved headroom, and supported chain
edges remain explicit operational inputs; their declared basis is preserved as provenance. The
committed default describes one managed task and therefore uses zero managed MCU utilization
without that task. It is not a claim of zero total MCU or firmware utilization.

Evaluate every task in the input:

```bash
qf recommend \
  --input data/processed/stage6/recommendation-input.json \
  --output data/processed/stage6/recommendations.json
```

Evaluate exactly one named task, matching the required `qf recommend filter` form:

```bash
qf recommend filter \
  --input data/processed/stage6/recommendation-input.json \
  --output data/processed/stage6/filter-recommendation.json
```

Each record ID is the SHA-256 of canonical task, policy, and MCU-capacity input. There is no
timestamp in the decision record, so identical inputs produce byte-equivalent recommendations.
Every report carries `advisory_only: true`, `placement_changes: 0`, and
`placement_changed: false` for each task.

## Positive and negative scenario suite

Run the deterministic policy suite from the evidence-derived input:

```bash
qf recommend-scenarios \
  --input data/processed/stage6/recommendation-input.json \
  --output data/processed/stage6/recommendation-scenarios.json
```

The eleven scenarios cover the measured end-to-end choice, a valid positive RT recommendation,
insufficient evidence, destination rejection, effect ineligibility, Linux-to-RT-to-Linux chain
cost, cooldown, MCU headroom, a non-satisfied contract, excessive observed miss rate, and predicted
deadline failure. Each case is evaluated twice for byte-equivalent determinism and asserts
advisory-only behavior with zero placement changes. Scenario mutations are policy validation
evidence; only the unmodified base case represents the measured hardware input.

## Completion audit

Generate every Stage 6 artifact and run the final reproducibility gate on the workstation:

```bash
bash scripts/run-stage6-recommendation-audit.sh stage6-recommendations-01
```

The audit rebuilds the input from Stage 5 and the ABI, recomputes complete and filtered
recommendations, reruns all scenarios, and requires byte-equivalent deterministic results. It also
checks the measured faster-MCU/slower-end-to-end decision, positive RT selection, insufficient-
evidence withholding, all nine rejection reason codes, MCU utilization/headroom reporting, and
advisory-only behavior with zero placement changes.

The evidence directory is `data/processed/stage6/stage6-recommendations-01`; its canonical result
is `stage6-audit.json`. No new board campaign is required because Stage 6 consumes the untouched,
audited Stage 5 hardware measurements and never executes or relocates a task.

## Version 1 exclusions

Stage 6 does not change live placement, estimate formal WCET, invent missing boundary costs, or
infer transition hooks. Dynamic migration, canary execution, and automatic rollback belong to
later stages.
