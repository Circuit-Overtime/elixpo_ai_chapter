# Stage 10 kernel instrumentation

Stage 10 adds one narrowly justified kernel-facing measurement path. It uses standard Linux
`perf_event_open` software counters and introduces no eBPF program, kernel patch, scheduler change,
or out-of-tree module. Placement, contracts, recovery, and all decision policy remain in userspace.

## Measured deficiency

Stage 4 records `queueing_ns` between two adjacent Python timestamps immediately before an
invocation. That field measures profiler bookkeeping. It cannot distinguish time executing on a
CPU from time the Linux QTask is runnable, blocked, descheduled, or migrating.

The Stage 10 capability probe must run before selecting a mechanism. On the tested UNO Q kernel:

- `PERF_EVENTS`, BPF syscalls, and the BPF JIT are enabled;
- PSI is not compiled in;
- scheduler statistics are not compiled in, so `/proc/<pid>/schedstat` wait time is ineffective;
- ftrace and scheduler tracepoints are absent;
- kernel BTF is absent; and
- unprivileged perf is limited by `perf_event_paranoid=2`.

These facts rule out truthful pressure and precise `sched_wakeup`-to-`sched_switch` measurements on
the stock image. They also remove the practical attachment points that would justify eBPF. A
custom helper or module would enlarge the trusted computing base solely to obtain diagnostics, so
Stage 10 explicitly does not introduce one.

## Selected measurement

The instrumented Linux path forks a QTask child and stops it before `exec`. It then:

1. opens task-clock, context-switch, and CPU-migration perf counters for that child PID;
2. opens a pidfd for bounded completion waiting;
3. enables the perf group and resumes the child;
4. measures the monotonic resume-to-exit lifecycle interval;
5. stops and reads the counters; and
6. validates the original correlated QTask output.

Fresh counters are opened per invocation. Reusing an inherited parent group is forbidden because
exited-child counts can accumulate across resets. Child-only attachment also prevents aggregate
parent/child CPU time from exceeding the measured single-child lifecycle interval.

The report contains:

- lifecycle end-to-end time;
- child task-clock time;
- `non_cpu_ns = end_to_end_ns - task_clock_ns`;
- context-switch count; and
- CPU-migration count.

`non_cpu_ns` is time for which this child was not executing on a CPU. It includes runnable delay,
sleep, blocking, and other off-CPU causes. Without scheduler tracepoints, QFabric does not label it
as precise wake-up latency or pure run-queue delay.

## Modes and safe degradation

`qf kernel benchmark --baseline` uses the same stopped-child lifecycle without perf counters.
This is the controlled before/after comparison. `qf kernel benchmark --force-fallback` uses the
ordinary portable userspace invocation and simulates unavailable instrumentation. A failed perf
probe selects the same userspace fallback instead of failing QTask execution.

Kernel-inclusive task-clock and scheduler events require root or `CAP_PERFMON` on the tested
configuration. The final campaign used root for measurement only. No privileged service remains
running afterward, reports are returned to the `arduino` account, and policy decisions never enter
the privileged process.

## Commands

Capture capabilities or run a portable fallback without privilege:

```bash
qf kernel capabilities --output capabilities.json
qf kernel benchmark --force-fallback --output fallback.json
```

Run the complete replicated hardware campaign from the repository virtual environment:

```bash
sudo env \
  PATH="$PWD/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  QF_REPETITIONS=3 \
  QF_ITERATIONS=500 \
  QF_WARMUP=50 \
  QF_LOAD_WORKERS=8 \
  bash scripts/run-stage10-kernel-campaign.sh stage10-kernel-02

sudo chown -R arduino:arduino \
  data/processed/stage10/stage10-kernel-02
```

The campaign records three controlled baseline/perf pairs, three perf runs under eight `stress-ng`
CPU workers, a known 5 ms off-CPU delay test, a forced fallback, the stress log, capabilities, and
the final audit. The audit rejects unavailable or unprivileged scheduler counters, incomplete
attribution, inaccurate delay recovery, unsafe fallback, policy relocation, custom modules,
missing loaded scheduler events, or p95 overhead above 15%.
