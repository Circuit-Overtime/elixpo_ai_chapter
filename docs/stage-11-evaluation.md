# Stage 11 evaluation protocol

Stage 11 evaluates the single QFabric contribution: safe, closed-loop recovery of empirical
timing contracts across the Linux–RTOS MCU boundary. Profiling, recommendation, visualization,
and optional kernel counters are supporting mechanisms, not separate novelty claims.

## Evidence boundary

The evaluation has two explicitly separated layers:

1. Direct hardware evidence is taken from the audited Stage 1–10 reports and the Stage 11
   SCHED_FIFO campaign on the Arduino UNO Q.
2. Application results are deterministic, seeded trace replays over declared workload graphs.
   Every node duration is sampled from a measured hardware trace. These are not claimed as direct
   executions of four complete application binaries and are not hard real-time guarantees.

The four workload graphs are a controlled synthetic chain, a signal-processing pipeline, a
control-loop simulation, and a network-connected pipeline containing Linux-only endpoints. The
flagship scenario replays the synthetic chain under the measured eight-worker Linux contention
trace, with the switch point taken from the real Stage 7 closed-loop recovery report.

## Baselines

Every workload and the flagship include ordinary Linux, tuned Linux SCHED_FIFO, a static MCU-first
heuristic, a declared manual-expert placement, the QFabric static recommendation, full QFabric
recovery, and an offline oracle. The oracle exhaustively searches every semantically feasible
placement for each replay observation and is an unattainable upper bound. PREEMPT_RT is reported
unavailable when the running kernel is not a PREEMPT_RT build; it is never silently substituted.

All baselines within a workload use paired replay seeds. Results are emitted even when unfavorable;
an unavailable platform baseline remains a labeled row rather than being removed.

## Threshold provenance

The per-node deadline is derived only from the Stage 1 idle round-trip baseline:

- take the maximum p99 across all three repetitions;
- multiply by the predeclared 1.25 safety factor; and
- round upward to the next 5 ms.

For the retained Stage 1 dataset this produces 20 ms. A chain deadline is the per-node deadline
times its node count. The evaluator records every source p99, the rule, and post_hoc_tuned=false.

The cross-domain edge cost is the median of those three conservative p99 measurements. It is added
only when adjacent graph nodes use different domains.

## Reproduction

On the UNO Q, after activating the repository virtual environment:

    git pull --ff-only
    python -m pip install -e .
    sudo -E env PATH="$PATH" \
      bash scripts/run-stage11-evaluation.sh stage11-evaluation-01

The campaign runs 1,100 invocations for each tuned profile (100 warm-up and 1,000 retained),
captures idle and eight-worker loaded SCHED_FIFO traces, evaluates 1,000 observations per cell,
generates CSV and SVG paper artifacts, and runs the independent Stage 11 audit.

Copy the complete result directory to the development machine:

    mkdir -p data/processed/stage11
    ssh qfabric-unoq \
      'cd ~/QFabric && tar -czf - data/processed/stage11/stage11-evaluation-01' \
      | tar -xzf -

The result manifest stores SHA-256 digests for every input, while campaign.txt records the exact
command, Git commit, kernel, architecture, Python version, iteration counts, load, and fixed seed.

## Programmer-effort proxy

The effort comparison counts nonblank, noncomment maintained source lines in the QTask declaration
and a checked-in representative handwritten Bridge implementation. It covers serialization,
dispatch, validation, placement-boundary, and state concerns, but it is only an implementation
proxy—not a user study, time-on-task measurement, or general productivity claim.
