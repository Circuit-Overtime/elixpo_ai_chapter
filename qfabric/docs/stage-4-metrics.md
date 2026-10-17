# Stage 4 profiling schema

Stage 4 profile reports use schema version 1. Each sample is identified by the ABI epoch and a
unique 64-bit invocation ID. Reports group measurements by task and actual execution domain.
The completed hardware results and limitations are recorded in the
[Stage 4 findings](stage-4-findings.md).

## Clock discipline

End-to-end latency is always the difference between two Linux monotonic timestamps around one
invocation. Linux-local execution is a Linux monotonic duration. MCU execution and MCU-local
queueing are durations measured entirely by the MCU clock. QFabric never subtracts an MCU
timestamp from a Linux timestamp.

Communication and queueing fields are duration components with an explicit estimator source. A
component remains absent until its estimator is valid; absence is not represented as zero.

## Measurement window

Every task/domain group exposes:

- total invocation count;
- required and observed warm-up samples;
- retained-window capacity and sample count;
- dropped samples caused by bounded-window eviction;
- the minimum sample requirement;
- estimator validity and an invalidity reason; and
- evaluated deadlines, misses, and met percentage.

Cold-start output reports `warmup-incomplete`. After warm-up but before the minimum sample count it
reports `insufficient-samples`.

## Metrics

End-to-end latency, local execution, communication, queueing, and consecutive-latency jitter use
the same stable summary: count, minimum, mean, p50, p95, p99, maximum, and population standard
deviation, all in nanoseconds.

Each group retains its bounded raw sample records in the same JSON report. Independent analysis can
therefore recompute every aggregate without relying on QFabric's summary implementation.

Instrumentation has three explicit modes:

- `disabled`: disable task-internal instrumentation while the outer benchmark records end-to-end
  cost for overhead comparison;
- `reduced`: collect correlation and Linux end-to-end timing only; and
- `full`: also collect available local execution, communication, queueing, and deadline data.

The machine-readable report is canonical JSON. `qf status` will render the same persisted report
for humans without recomputing its metrics.

## Build and deploy the profiling runtimes

Build the Linux runner and MCU firmware from the workstation:

```bash
mkdir -p build/stage4/linux build/stage4/rt

aarch64-linux-gnu-g++ \
  -std=c++20 -O2 -Wall -Wextra -Werror -pedantic \
  runtime/stage4/linux/qf_profile_linux.cpp \
  -o build/stage4/linux/qf-profile-linux

arduino-cli compile \
  --fqbn arduino:zephyr:unoq \
  --build-path build/stage4/rt \
  --build-property "compiler.cpp.extra_flags=-I$PWD" \
  runtime/stage4/rt/qf_stage4_profile
```

Upload the firmware and copy the Linux artifact as in earlier stages. The Linux runner echoes the
64-bit invocation ID with its result. The RT runtime stores the epoch, counter, mode, and local
execution duration; the Linux profiler retrieves and validates those diagnostics only after the
end-to-end interval has closed.

## Profile and inspect

Run a bounded full-instrumentation smoke campaign on the UNO Q:

```bash
qf profile \
  --domain both \
  --mode full \
  --iterations 20 \
  --warmup 5 \
  --minimum-samples 20 \
  --output data/processed/stage4/profile-smoke.json

qf status --input data/processed/stage4/profile-smoke.json
qf status --input data/processed/stage4/profile-smoke.json --json
```

Use `--mode all` for a disabled/reduced/full overhead comparison. Diagnostic Bridge calls occur
after the measured RT interval, so reading the MCU-local measurement cannot inflate the recorded
end-to-end latency.

Independently recompute every stored aggregate and calculate instrumentation deltas with:

```bash
qf profile-analyze \
  --input data/processed/stage4/profile-overhead.json \
  --output data/processed/stage4/profile-overhead-analysis.json
```

The reference path uses Python's independent `statistics` implementation for mean and population
standard deviation and separately recomputes the ordered percentiles. The documented tolerance is
0.01% with an absolute floor of 1 ns.

## Completion audit

The Stage 4 gate requires disabled, reduced, and full profiles for both domains plus a separate
insufficient-sample report. Run it on the UNO Q with:

```bash
qf profile-audit
```

The audit permits at most 5% absolute mean instrumentation overhead and 10% absolute p95 overhead
relative to disabled mode. It also requires exact group coverage, valid estimators, zero failures,
zero deadline misses, zero drops, independent metric agreement, full-mode component measurements,
strict clock separation, and explicit insufficient-sample states for both domains.
