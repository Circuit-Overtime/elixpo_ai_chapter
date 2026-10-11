# Stage 4 findings

Stage 4 is complete. QFabric now records correlated, bounded profiles for the same QTask in the
Linux and RT domains, preserves clock-domain boundaries, rejects statistically immature reports,
and quantifies the cost of its own instrumentation. The final audit passed on the Arduino UNO Q
with no failures.

## Accepted measurement model

Every invocation carries its ABI epoch and a unique 64-bit invocation ID. Linux end-to-end
latency is measured only between Linux monotonic timestamps. Linux-local execution uses the same
clock, while MCU-local execution and queueing use only the MCU clock. No reported duration is
formed by subtracting timestamps from different clocks.

Each task/domain group records its warm-up count, bounded retained window, dropped samples,
minimum evidence requirement, estimator validity, and deadline outcomes. The persisted raw
samples remain in the canonical JSON report so an independent implementation can recompute every
aggregate.

These measurements support empirical soft real-time claims. They are observations from the tested
hardware and workload, not formal worst-case execution-time guarantees.

## Correlation and estimator validation

The overhead campaign retained 1,200 invocation records: 200 records for each combination of two
domains and three instrumentation modes. All invocation IDs were unique. Across the six groups,
there were zero invocation failures, deadline misses, or bounded-window drops.

Independent analysis recomputed five metrics for every group: end-to-end latency, local execution,
communication, queueing, and jitter. All 30 comparisons passed the documented 0.01% tolerance.

A separate cold-start test retained five samples per domain against a minimum requirement of 20.
Both estimators correctly reported `insufficient-samples`; neither produced a valid timing claim.

## Instrumentation overhead

Disabled instrumentation was the baseline within each execution domain. Negative deltas are
ordinary run-to-run variation rather than claimed speedups.

| Domain | Mode | Mean delta | p95 delta | Result |
| --- | --- | ---: | ---: | --- |
| Linux | reduced | -0.230% | -2.192% | pass |
| Linux | full | -0.183% | -2.408% | pass |
| RT | reduced | +0.170% | +0.337% | pass |
| RT | full | +0.348% | +1.385% | pass |

Every comparison remained within the audit limits of 5% absolute mean overhead and 10% absolute
p95 overhead.

The 200-sample disabled baselines had mean end-to-end latencies of 7.773 ms on Linux and 10.276 ms
on RT, with p95 values of 8.246 ms and 11.261 ms respectively. The bounded full-profile smoke test
reported p95 end-to-end latency of 7.620 ms on Linux and 10.688 ms on RT. Its mean local execution
measurements were 276.1 ns on Linux and 331 ns on the MCU, showing that transport and orchestration
dominate this minimal task's end-to-end latency.

## Completion evidence

The final audit was captured at `2026-10-09T05:16:43.830782+00:00`. It recorded:

- Stage 4 status `pass` with no failures;
- exact coverage of disabled, reduced, and full modes in both domains;
- 1,200 retained, uniquely correlated invocation records;
- 30 independently reproduced metric summaries;
- zero failures, deadline misses, and sample drops;
- four passing instrumentation-overhead comparisons;
- explicit `insufficient-samples` results for both cold-start groups; and
- strict separation of Linux and MCU clock measurements.

The Stage 4 MCU firmware used 91,032 bytes of program storage and 36,372 bytes of global dynamic
memory. The hardware-independent suite contained 66 passing tests at completion.

## Deferred to Stage 5

Stage 4 evaluates individual configured deadlines and supplies trustworthy measurement windows,
but it does not convert those windows into a persistent contract state. Stage 5 will define the
deterministic `UNKNOWN`, `SATISFIED`, `AT_RISK`, `VIOLATED`, and `INFEASIBLE` states, including
minimum evidence, sustained-window thresholds, recovery hysteresis, and explicit missing-sample
behavior. Those states will remain empirical soft real-time assessments rather than WCET proofs.
