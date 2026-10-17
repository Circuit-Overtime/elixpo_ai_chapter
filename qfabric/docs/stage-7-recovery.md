# Stage 7 safe closed-loop recovery

Stage 7 is QFabric's core novelty stage. It turns a credible empirical timing-contract violation
and an admitted Stage 6 alternative into a boundary-safe trial, then commits only after verified
probation or rolls back with cooldown and temporary blacklisting.

The protocol remains an empirical soft real-time mechanism. It does not claim formal WCET or make
an unsafe task eligible merely because another domain appears faster.

## Recovery states

- `MONITORING`: observe the current placement; no recovery is armed.
- `WAITING_BOUNDARY`: a credible violation and eligible alternative exist, but switching waits for
  a declared safe boundary.
- `PROBATION`: the epoch changed and the alternate domain is being verified.
- `ROLLBACK_WAIT`: probation failed, but restoration waits for a declared safe boundary.
- `COOLDOWN`: a commit or rollback completed; new switches are suppressed.
- `INFEASIBLE`: safe alternatives are exhausted; automatic switching stops.

`UNKNOWN`, `SATISFIED`, `AT_RISK`, or invalid evidence cannot arm recovery. Only a valid Stage 5
`VIOLATED` source can do so. The alternate must differ from the current domain and pass semantic,
admission, predicted-feasibility, cooldown, and blacklist gates.

## Boundary and epoch invariants

Every switch and rollback action records `safe_boundary: true`. A domain change increments the
epoch exactly once, so a failed trial increments once on entry and once on restoration. Detection
may occur away from a boundary, but execution remains on the original domain in
`WAITING_BOUNDARY` until the trace declares a safe transition point.

If the violation clears, the recommendation changes, or a gate closes before that point, recovery
is cancelled without a domain or epoch change.

## Probation, commit, and rollback

Version 1 requires three consecutive target `SATISFIED` windows while every protected contract
remains healthy. Any non-satisfied target window resets the healthy streak. Target `VIOLATED` or
`INFEASIBLE`, a protected-contract regression, or probation timeout arms rollback.

Rollback occurs immediately only at a safe boundary; otherwise `ROLLBACK_WAIT` preserves the trial
placement until a safe restoration point. The failed destination is then blacklisted for five
windows and recovery cools down for three windows. Because the blacklist outlasts cooldown, the
same candidate cannot be retried immediately.

When the current placement is credibly violated and all safe alternatives are exhausted, the
controller enters `INFEASIBLE` and holds instead of oscillating.

## Deterministic trace replay

A recovery trace fixes the policy, initial placement and epoch, and one observation per contract
window. Each observation supplies source evidence, the static recommendation gates, boundary
availability, probation health, transient misses, and protected-contract health.

```bash
qf recover replay \
  --input data/raw/stage7/recovery-trace.json \
  --output data/processed/stage7/recovery-report.json
```

The report preserves every before/after state, action, domain, epoch, cooldown, and blacklist. It
also reports detection delay, time to verified recovery, transient misses, protected-contract
regressions, attempts, commits, rollbacks, rollback rate, successful recovery rate, domain changes,
and oscillations.

This initial replay implementation changes no live placement. Hardware actuation will be added
only after the protocol invariants and fault-injection traces pass the Stage 7 audit.

## Controlled fault-injection suite

Run the deterministic protocol evaluation with:

```bash
qf recover scenarios \
  --output data/processed/stage7/recovery-scenarios.json
```

The ten scenarios cover noisy or insufficient evidence, successful boundary-delayed recovery,
semantic and admission rejection, target failure, protected-contract regression with deferred
rollback, probation timeout, cooldown plus blacklist suppression, cancellation before a boundary,
and exhausted alternatives. Every injected trace is labelled
`controlled-fault-injection-not-hardware-performance`.

The suite requires complete recovery-state coverage, safe-boundary flags on every domain change,
epoch increments matching domain changes, deterministic replay, and zero false switches. Its
aggregate report includes detection-delay and verified-recovery samples, transient misses,
protected-contract regressions, attempts, commits, rollbacks, success and rollback rates, and
oscillation count.

## Evidence handoff from Stages 5 and 6

Join a persisted Stage 5 source-contract report and Stage 6 recommendation into one validated
recovery observation with:

```bash
qf recover evidence \
  --source-contract data/processed/stage5/stage5-contracts-01/linux-report.json \
  --recommendation data/processed/stage6/stage6-recommendations-01/recommendations.json \
  --task add \
  --safe-boundary \
  --output data/processed/stage7/recovery-evidence.json
```

The adapter requires the source state and evidence count to match the recommendation record. It
preserves the selected alternate and independently derives semantic, admission, and predicted-
feasibility gates from stable Stage 6 reason codes. Missing evidence, cooldown, or a merely slower
alternative does not claim exhaustion. A credibly violated source with only permanently rejected
alternatives may set `alternatives_exhausted`, allowing the controller to report `INFEASIBLE`.

Safe-boundary availability, target probation state, transient misses, and protected-contract
health are Stage 7 runtime facts and cannot be inferred from the static recommendation.

## Hardware-safe execution boundary

The recovery executor runs bounded, sequential invocation windows through the real AArch64 Linux
artifact or STM32 Bridge method. A window is a safe boundary only when its in-flight count is zero.
The executor rejects any recovery observation that disagrees with that measured condition.

Controller state and backend placement/epoch are checked before and after every window. A
controller `switch` or `rollback` action is the only path to the backend transition method; the
executor additionally requires the action and measured window to both declare a safe boundary.
The backend then requires the alternate domain and exactly `epoch + 1`, resets its invocation
counter for that epoch, and refuses to transition with an in-flight call.

Probation windows execute on the trial domain, so their actual outcomes can feed target-contract
evaluation. Rollback restores the origin at the next safe boundary, and the following window
executes in the restored domain and new epoch. Runtime reports preserve every execution sample,
recovery step, and applied placement transition.

Protected contracts cannot be declared without a health probe. When no protected workload is
declared, the report may state that the empty protected set remained healthy; this must not be
interpreted as measuring unrelated firmware or system activity.

The backend supports explicitly labelled per-window delay injection for controlled evaluation.
Injected delay is included inside the measured end-to-end interval and recorded on every affected
sample.

## Bounded hardware recovery campaigns

The live command is intentionally narrow: it runs exactly nine sequential windows, starts on
Linux, uses the persisted Stage 6 recommendation input, and supports only the `add` task backend.
It never rewrites firmware or changes system services. The `success` campaign injects delay into
Linux for windows 1--3 and then requires three healthy RT probation windows. The `rollback`
campaign continues injection through window 6, forcing the trial RT placement to fail probation
and restore Linux before cooldown completes.

Run the success path first:

```bash
qf recover hardware \
  --recommendation-input data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --mode success \
  --task add \
  --deadline-us 20000 \
  --injected-delay-us 20000 \
  --output data/processed/stage7/hardware-success.json
```

After the success report passes and the Bridge health check succeeds, run the rollback path by
changing `--mode` to `rollback` and the output name to `hardware-rollback.json`.

Each report contains all 180 invocation outcomes, per-domain contract windows, every dynamic
recommendation, controller action, placement transition, epoch, and injection label. Passing also
requires the expected final domain, exact commit/rollback count, safe transition boundaries, and
one epoch increment per domain change. These are controlled delay-injection experiments, not
unmodified workload-performance measurements. No protected workload is declared in this bounded
campaign; the empty protected-contract set must not be presented as evidence about other tasks.

## Final evidence audit

After copying both hardware reports beside `recovery-scenarios.json`, run:

```bash
qf recover audit \
  --root data/processed/stage7 \
  --recommendation-input \
  data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --output data/processed/stage7/stage7-audit.json
```

The audit regenerates the ten deterministic scenarios and independently rebuilds each hardware
contract, dynamic recommendation, recovery observation, controller step, domain transition, and
epoch from the recorded invocation samples. It also verifies the controlled-injection provenance,
window labels, sample counts, expected success and rollback outcomes, and safe boundaries. A
top-level `pass` field alone is therefore insufficient: modified samples, evidence, actions, or
transitions cause the audit to fail.
