# Stage 10 findings

Stage 10 is complete. QFabric now uses standard Linux perf software counters to attribute the
Linux QTask lifecycle only where Stage 4 demonstrated a concrete measurement gap. No eBPF program,
kernel patch, custom scheduler, helper module, or out-of-tree module was introduced. The final UNO
Q hardware campaign and twelve-check audit passed.

## Measurement-gap result

The Stage 4 Linux/full `queueing_ns` p95 was 1,982.55 ns because it came from adjacent userspace
timestamps. The final Stage 10 perf campaign measured a median non-CPU p95 of 1,502,623.8 ns for
the controlled child lifecycle—757.9 times the old value. This does not mean the old number was a
noisy scheduler estimate; it confirms that it measured a different, much narrower interval and
must not be interpreted as scheduling delay.

## Capability decision

The stock UNO Q kernel provides `perf_event_open`, but does not provide effective scheduler
statistics, PSI, scheduler tracepoints/ftrace, or BTF. Therefore:

- child task-clock, context-switch, and migration counters use perf events;
- kernel-inclusive scheduler events require root or `CAP_PERFMON`;
- CPU pressure and exact wake-up latency are reported unavailable;
- eBPF is not used because the necessary attachment/evidence path is absent; and
- no kernel module is justified.

The final campaign ran the measurement command as root, then returned all files to the `arduino`
account. Placement and recovery policy remained in the normal Python userspace implementation.

## Accuracy and overhead

The known-delay test injected a 5,000,000 ns sleep inside the measured child lifecycle. Median
non-CPU time increased from 1,344,461 ns to 6,346,835 ns, an observed increase of 5,002,374 ns.
The absolute error was 2,374 ns against the audit tolerance of 1,000,000 ns.

Three idle repetitions retained 500 observations per condition after 50 warm-ups:

| Condition | Median mean end-to-end | Median p95 end-to-end | Median mean task-clock | Median mean non-CPU |
| --- | ---: | ---: | ---: | ---: |
| userspace baseline | 9.256 ms | 9.643 ms | unavailable | unavailable |
| perf enabled | 9.726 ms | 10.006 ms | 8.386 ms | 1.341 ms |

Perf increased median mean lifecycle time by 5.08% and median p95 by 3.76%. The p95 result remained
inside the declared 15% Stage 10 budget. Idle perf observations recorded 181 context switches and
seven migrations across 1,500 retained invocations.

## Scheduler-contention response

The loaded campaign used eight `stress-ng` CPU workers and retained another 1,500 perf observations.
The stressor completed successfully with zero failed workers. Under load:

- median mean end-to-end time was 22.695 ms;
- median p95 end-to-end time was 34.058 ms;
- median mean task-clock time was 7.073 ms;
- median mean non-CPU time was 15.607 ms;
- median non-CPU p95 was 27.022 ms;
- 1,975 context switches were observed; and
- 351 CPU migrations were observed.

The large rise in non-CPU time while task-clock remained near seven milliseconds is consistent with
scheduler contention. It is not a formal decomposition of runnable delay versus blocking because
the stock kernel lacks the tracepoints needed for that distinction.

## Safe fallback

The campaign forced perf unavailable for 100 retained observations after 10 warm-ups. The ordinary
userspace QTask path completed all observations and reported `userspace-fallback` with the explicit
reason `forced-unavailable`. Optional instrumentation failure therefore reduces attribution rather
than terminating task execution or changing placement policy.

## Independent audit

The final audit was captured at `2026-10-09T08:43:12.599815+00:00`. All twelve checks passed:

- the Stage 4 deficiency was quantified;
- an existing kernel interface was selected;
- scheduler-event privilege was declared;
- all before/after reports were valid;
- child timing attribution was complete;
- scheduler events responded under CPU load;
- p95 overhead remained within budget;
- the known-delay measurement was accurate within tolerance;
- forced instrumentation failure degraded safely;
- policy remained in userspace;
- unavailable stock-kernel measurements were declared; and
- no custom module was introduced.

The hardware-independent suite contained 158 passing tests at completion. Negative coverage
includes denied optional files, unsupported syscall architectures, forced perf failure, incomplete
attribution, and audit-boundary violations.

## Claim boundary and limitations

Task-clock is empirical CPU residency for the measured child, not WCET. `non_cpu_ns` combines all
time off CPU; it is neither pure run-queue delay nor exact wake-up latency. Context switches and
migrations are counts, not causal explanations. The loaded campaign is one controlled stress
condition on one board and kernel build.

Root was used because `perf_event_paranoid=2` prevents unprivileged kernel-inclusive scheduler
events. A deployment should prefer a narrowly granted `CAP_PERFMON` helper or disable this optional
mode rather than run the whole application privileged. The userspace-only path remains the portable
default when perf, pidfds, permissions, or supported syscall numbers are unavailable.

## Next stage

Stage 11 will evaluate the complete QFabric contribution against Linux, static, expert, recovery,
and oracle baselines and generate publication-ready figures, tables, datasets, and reproduction
instructions.
