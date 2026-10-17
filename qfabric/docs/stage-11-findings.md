# Stage 11 findings

Stage 11 is complete. The final Arduino UNO Q campaign evaluated four declared workload graphs and
one loaded flagship scenario against seven baselines, retained the unfavorable results, generated
paper-ready CSV/SVG artifacts, and passed all 18 independent audit checks. The result supports a
narrow claim: QFabric can detect and safely recover a tested empirical timing-contract violation
across the Linux–MCU boundary. It does not show that dynamic recovery beats a correctly tuned Linux
scheduler in every workload.

## Experimental basis

The campaign ran on the UNO Q with Linux 6.16.7-g0dd6551ae96b, AArch64, Python 3.13.5, fixed seed
11012026, 1,000 retained observations per cell, and eight stress-ng CPU workers for loaded
conditions. SCHED_FIFO priority 50 was available and active for both tuned traces. The stock kernel
was not PREEMPT_RT; SCHED_DEADLINE was not substituted because SCHED_FIFO was the predeclared tuned
baseline.

The Stage 1 idle round-trip p99 values were 13.664, 8.962, and 9.111 ms. Applying the predeclared
1.25 safety factor and rounding upward to 5 ms produced the 20 ms per-node deadline. No Stage 11
outcome was used to tune this threshold.

The four application-level results are seeded replays of hardware-measured node traces over a
synthetic chain, signal pipeline, control loop, and network pipeline with Linux-only endpoints.
They are not direct executions of four independent application binaries. Direct board evidence
comes from the underlying Stage 1–10 measurements and the new SCHED_FIFO profiles.

## Flagship result

The loaded four-node chain used an 80 ms end-to-end deadline. All seven baseline rows are retained:

| Baseline | p95 | Miss rate | Result |
| --- | ---: | ---: | --- |
| ordinary Linux | 111.301 ms | 67.3% | violated under measured contention |
| tuned Linux SCHED_FIFO | 23.907 ms | 0.0% | best measured deployable baseline |
| static MCU-first | 43.448 ms | 0.0% | feasible for this all-movable chain |
| manual expert | 100.935 ms | 58.3% | cross-domain edges dominated |
| QFabric static | 111.301 ms | 67.3% | stale idle placement did not adapt |
| QFabric recovery | 70.614 ms | 3.7% | 36.56% lower p95 than ordinary Linux |
| offline oracle | 43.448 ms | 0.0% | unattainable per-observation placement bound |

QFabric recovery switched after the third 20-invocation window and committed after three probation
windows. The initial 60 loaded observations remain in the full-run distribution, producing the
3.7% miss rate. This is intentionally not cropped to post-recovery samples.

The tuned result is decisive: SCHED_FIFO was 2.95 times faster at p95 than QFabric recovery in this
controlled scenario. Dynamic cross-domain recovery remains useful as a safety mechanism when an
existing placement loses its empirical contract, but it is not a replacement for correct Linux
scheduling configuration. QFabric also trails the oracle by 1.63 times at p95 because detection and
probation are real costs and the oracle has future knowledge.

## Four workload graphs

At idle, every measured cell met its graph deadline. Ordinary Linux and QFabric static had p95s of
31.715 ms for the four-node synthetic chain and approximately 23.82–23.85 ms for each three-node
graph. Tuned Linux improved these to 25.081 ms and approximately 18.91–18.95 ms. Static MCU-first
was slower because the measured RT path includes Bridge communication. Mixed expert placements
were penalized by the measured cross-domain edge cost, especially in the network pipeline.

These negative results matter: no idle migration benefit is claimed, and the static QFabric policy
correctly stays on Linux. The network graph also demonstrates that Linux-only functions constrain
the feasible placement space rather than being silently modeled as movable.

## Research questions

### RQ1 — detection

The controlled hardware success run recorded one credible violation, a one-window controller
detection delay after credible evidence, and zero false switches. The contract itself required
three violating windows before evidence became credible. This supports bounded detection only for
the tested window and hysteresis configuration.

### RQ2 — recovery

The feasible alternate passed probation and committed on real hardware. In the flagship replay,
full recovery reduced p95 by 36.56% and misses from 67.3% to 3.7% relative to ordinary Linux. The
remaining misses are pre-switch observations, not hidden failures.

### RQ3 — safe rejection

The complete negative suite exercised insufficient evidence, effect ineligibility, destination
admission failure, MCU-headroom exhaustion, communication-dominated placement, cooldown, contract
state, observed miss-rate, and predicted deadline rejection. The Stage 7 hardware rollback run
returned to Linux after failed probation; deterministic recovery scenarios cover cooldown and
candidate blacklisting/repeat suppression.

### RQ4 — expert and oracle comparison

QFabric substantially beats the declared mixed manual placement under contention, but it does not
match either tuned Linux or the oracle. Recovery/oracle p95 is 1.625; recovery/SCHED_FIFO p95 is
2.954. The appropriate conclusion is improvement over an ordinary stale placement, not universal
optimality.

### RQ5 — overhead

- Static recommendation policy evaluation on the board took 170.1 us CPU p95 and 177.2 us wall
  p95 across 1,000 iterations.
- A single policy decision peaked at 3,138 Python-traced bytes. This excludes interpreter baseline
  and native allocator memory.
- Full profiling changed p95 by -2.41% on Linux and +1.39% on RT relative to disabled
  instrumentation; the negative Linux delta is measurement noise, not a speedup claim.
- Communication p95 was 8.047 ms for Linux and 11.417 ms for RT in the Stage 4 full traces.
- Optional perf instrumentation added 3.76% p95; visualization added 2.05% p95 in its worst domain.
- Recovery required three probation windows (60 invocations) from switch to commit.

### RQ6 — programmer effort

The checked-in proxy has four nonblank, noncomment maintained lines in the QTask declaration versus
44 in the representative manual Bridge implementation, a 90.91% reduction. This comparison covers
the declared example only. It is not a user study, development-time measurement, or general
productivity result.

## Reproducibility and audit

The final evidence is in data/processed/stage11/stage11-evaluation-01. It contains both tuned raw
profiles, the scheduler and stressor records, fixed configuration, complete JSON evaluation, CSV
table, SVG figure, and board/local audit reports. Its source manifest hashes every input. The
checked-in source set is sufficient to rerun the deterministic analysis without the board.

All 18 audit checks passed, including the complete 4×7 and 1×7 matrices, derived threshold,
fixed-seed/no-cherry-picking rule, positive/negative/infeasible/rollback coverage, oracle upper
bound, all six research questions, quantified overheads, source hashes, and regenerable table and
figure. The hardware-independent suite contained 162 passing tests before the final board run.

## Limitations

QFabric provides empirical soft real-time evidence, not WCET analysis or hard real-time
guarantees. Results come from one board, kernel, load generator, QTask primitive, and run date.
Application graphs replay measured traces and do not capture every dependency, cache effect,
network behavior, or concurrent graph interaction. The oracle has future knowledge. The expert
placement and programmer-effort baseline are declared proxies, not results from an expert panel or
user study. PREEMPT_RT was unavailable and is not evaluated.

The LED/RGB view remains a faithful physical rendering of the same persisted QFabric decisions,
but the Stage 11 replay does not drive a new animation; visualization fidelity and overhead are
carried from the audited Stage 9 hardware trace.
