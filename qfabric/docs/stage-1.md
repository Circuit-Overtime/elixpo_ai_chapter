# Stage 1: UNO Q hardware and timing characterization

Stage 1 deliberately chooses no timing contract. Its output is the dataset used to select defensible thresholds later.

## Responsibility split

Codex maintains the benchmark, analysis, tests, and documentation. The developer runs package installation, flashing, load generation, and hardware measurements on the connected UNO Q.

## Workstation installation and checks

Install ADB on Debian/Ubuntu:

```bash
sudo apt update
sudo apt install adb
adb version
```

If `adb devices -l` shows a permissions error on Linux, install the standard Android udev rules package for your distribution or run the command once with appropriate device permissions; do not make the device globally writable.

Check the existing toolchain:

```bash
arduino-cli version
cmake --version
gcc --version
python3 --version
gh auth status
```

Connect the UNO Q and confirm that ADB can see it:

```bash
adb devices -l
arduino-cli board list
```

If the ADB device is unauthorized, accept the debugging prompt on the board and run `adb devices -l` again.

## Python environment

After the initial QFabric commit has been pushed, enter the UNO Q Linux environment and clone the repository there. The benchmark must run on the board because the default Router socket is local to its Linux domain:

```bash
adb shell
git clone https://github.com/elixpo/qfabric.git
cd QFabric
```

Create the environment:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
qf-stage1 --help
```

The harness uses Arduino's official `arduino-router-bridge` Python package and defaults to `unix:///var/run/arduino-router.sock`.

## Arduino core and library checks

```bash
arduino-cli config add board_manager.additional_urls \
  https://downloads.arduino.cc/packages/package_zephyr_index.json
arduino-cli core update-index
arduino-cli core list
arduino-cli lib list
arduino-cli board details --fqbn arduino:zephyr:unoq
```

Install missing components only if the checks show they are absent:

```bash
arduino-cli core install arduino:zephyr
```

`Arduino_LED_Matrix` is supplied through the UNO Q Zephyr platform. `Arduino_RouterBridge`
is a separate official Arduino library. The benchmark's default `sketch.yaml` profile pins
the core, RouterBridge, and its dependency chain and downloads them into Arduino CLI's isolated
profile cache during compilation. A global Library Manager installation is useful for examples
but is not required or used by the isolated profile build. Do not substitute similarly named
third-party Bridge or matrix libraries.

## Compile and flash the MCU probe

For VS Code C/C++ IntelliSense, run the `Arduino: refresh UNO Q IntelliSense` task or generate
the pinned compilation database directly:

```bash
arduino-cli compile \
  --fqbn arduino:zephyr:unoq \
  --only-compilation-database \
  --build-path build/stage1-probe \
  benchmarks/stage1/mcu/stage1_probe
```

The repository maps `.ino` files to C++ and points the C/C++ extension at that database. Because
`build/` is generated and ignored, refresh the database after changing the pinned Arduino core or
library versions.

Compile first:

```bash
arduino-cli compile \
  --fqbn arduino:zephyr:unoq \
  benchmarks/stage1/mcu/stage1_probe
```

The exact upload path depends on the connected UNO Q mode. Confirm it with `arduino-cli board list`, then upload using the detected port:

```bash
arduino-cli upload \
  --fqbn arduino:zephyr:unoq \
  --port DETECTED_PORT \
  benchmarks/stage1/mcu/stage1_probe
```

Do not open `/dev/ttyHS1` directly. It is reserved by `arduino-router`.

## Router checks on the UNO Q

```bash
systemctl status arduino-router --no-pager
systemctl show arduino-router --property=ExecStart --no-pager
stat /var/run/arduino-router.sock
qf-stage1 check
```

The health check verifies both the Linux Router connection and registration of the Stage 1 MCU
echo method. Campaign and smoke scripts refuse to start if that method is unavailable.

Capture the environment before each firmware/software change:

```bash
bash scripts/capture-stage1-environment.sh
```

## Smoke tests

Run the complete smoke suite from the UNO Q Linux environment. The script verifies the Router
socket, captures the environment, and writes each run to a new timestamped directory:

```bash
bash scripts/run-stage1-smoke.sh
```

An optional run label makes a result directory easier to identify:

```bash
bash scripts/run-stage1-smoke.sh first-hardware-run
```

The equivalent individual commands are:

```bash
qf-stage1 run roundtrip \
  --payload-size 8 \
  --iterations 20 \
  --warmup 5 \
  --output data/raw/smoke.jsonl

qf-stage1 run reverse \
  --iterations 20 \
  --warmup 5 \
  --output data/raw/smoke-reverse.jsonl

qf-stage1 run clock \
  --iterations 20 \
  --warmup 5 \
  --output data/raw/smoke-clock.jsonl

qf-stage1 run matrix \
  --iterations 20 \
  --warmup 5 \
  --output data/raw/smoke-matrix.jsonl
```

## Full payload sweep

Run a complete three-repetition idle campaign from the UNO Q. This includes every configured
payload size plus reverse-direction, clock, and matrix experiments, with separate raw and
processed files for each repetition:

```bash
QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-campaign.sh idle initial-idle
```

The lower-level payload-only command remains available for focused experiments:

```bash
QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-payload-sweep.sh
```

The campaign runner exits with status 2 if RPC samples fail, but retains and analyzes those
samples because payload-limit failures are useful saturation evidence. It stops immediately for
an infrastructure error. Never concatenate measurements from different firmware or system
configurations without matching environment metadata.

Before each payload configuration, the sweep performs one call with a bounded timeout. A failed
preflight is recorded and stops the sweep instead of queuing more requests on an unhealthy Bridge
path. The timeout is configurable when investigating the boundary:

```bash
QF_PREFLIGHT_TIMEOUT=0.25 QF_TIMEOUT=5 \
  bash scripts/run-stage1-campaign.sh idle initial-idle
```

The baseline campaign uses the confirmed responsive range in
`config/stage1-payload-sizes.txt`. Potentially disruptive sizes begin at 256 bytes and live in
`config/stage1-boundary-payload-sizes.txt`; probe them separately, then verify or restart the
Router before any subsequent baseline measurement.

## Controlled Linux contention

Install the load generator on the UNO Q:

```bash
sudo apt update
sudo apt install stress-ng
stress-ng --version
```

Start with CPU contention only:

```bash
QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-loaded-campaign.sh initial-cpu-load
```

The wrapper starts four `stress-ng` CPU workers, waits ten seconds for load stabilization, records
the exact profile and stress metrics, runs the campaign, and terminates only the load process it
started. `QF_STRESS_CPU_WORKERS` and `QF_STRESS_WARMUP_SECONDS` override those defaults. Later
runs may add memory and I/O contention, but each load profile must be recorded separately.

## Controlled CPU frequency

Use the `performance` governor for matched idle and loaded campaigns to separate the observed
`schedutil` frequency response from scheduling contention. Authenticate `sudo` before detaching
the command; the wrapper deliberately refuses to prompt after it starts:

```bash
sudo -v

QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-governor-campaign.sh \
  performance idle stage1-performance-idle

sudo -v

QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-governor-campaign.sh \
  performance cpu-loaded stage1-performance-cpu-loaded
```

The wrapper records every original policy governor, verifies that the requested governor is
available, keeps its non-interactive sudo authorization alive, and restores the original values
on success, failure, interruption, or SSH hangup. It gives the campaigns distinct
`idle-performance` and `cpu-loaded-performance` condition names. After each run, verify the
restoration:

```bash
for policy in /sys/devices/system/cpu/cpufreq/policy*; do
  echo "$policy: $(cat "$policy/scaling_governor")"
done
```

A power loss or kernel crash cannot execute shell cleanup; reboot the board before further
measurements if either occurs. The environment capture inside each campaign records the active
governor and frequency bounds.

## Analysis

Capture an MCU resource snapshot before and after a controlled workload:

```bash
qf-stage1 resources \
  --reset-after \
  --output data/raw/resources/before.json

# Run the controlled workload here.

qf-stage1 resources \
  --output data/raw/resources/after.json
```

The snapshot records configured kernel-heap, main-stack, Bridge-thread-stack, decoder-buffer,
and request-buffer capacities. It also reports loop iterations and the worst observed main-loop
gap since the last reset.

Runtime allocation probing is intentionally disabled. A bounded probe that allocated and
immediately released blocks through the stock Zephyr kernel and C-library allocators completed
once, but the MCU subsequently stopped producing RPC responses while the Linux Router remained
active. That failure is retained as negative saturation evidence; do not repeat it on the baseline
firmware. The configured capacities and build-time section sizes are safe, non-mutating evidence.

The stock UNO Q Zephyr 1.0.0 image enables thread stack metadata but not initialized-stack
watermarks, system-heap runtime statistics, or thread runtime statistics. The snapshot reports
those capabilities explicitly as unavailable instead of estimating them. Direct queue depth is
also unavailable through Arduino RouterBridge 0.4.3; practical queue headroom is measured by a
separate bounded concurrency sweep.

Smoke-test concurrency levels individually and verify health between them. Each runner submits at
most `--workers` calls at once and stops before the next batch if any call fails:

```bash
qf-stage1 resources \
  --reset-after \
  --output data/raw/resources/concurrency-baseline.json

qf-stage1 run concurrency \
  --workers 2 \
  --payload-size 8 \
  --iterations 100 \
  --warmup 10 \
  --timeout 2 \
  --output data/raw/concurrency/workers-02.jsonl

qf-stage1 check --timeout 2

qf-stage1 resources \
  --output data/raw/resources/concurrency-workers-02.json
```

Do not launch untested levels from an unattended loop. A failed level is saturation evidence:
retain its partial JSONL, stop escalation, and recover the Bridge before further baseline
measurements. After every intended level has passed its individual smoke test, run the gated
three-repetition campaign:

```bash
QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
QF_CONCURRENCY_LEVELS="1 2 4 8" \
  bash scripts/run-stage1-concurrency-campaign.sh \
  idle stage1-concurrency-idle
```

The campaign captures resource diagnostics before and after each level, performs an immediate
Bridge health check, analyzes every completed JSONL file, and stops before escalation on any
measurement or health failure.

After the idle campaign is complete, run the matched CPU-loaded campaign. This wrapper uses the
same four-worker `stress-ng` profile as the earlier loaded baseline, waits ten seconds for load to
stabilize, records its metrics, and always stops the process it started:

```bash
QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
QF_CONCURRENCY_LEVELS="1 2 4 8" \
  bash scripts/run-stage1-loaded-concurrency-campaign.sh \
  stage1-concurrency-cpu-loaded
```

`QF_STRESS_CPU_WORKERS` and `QF_STRESS_WARMUP_SECONDS` override the four-worker and ten-second
defaults. Keep them unchanged for a direct comparison with `stage1-concurrency-idle`.

## LED matrix activity profiles

The LED experiment separates three MCU states supported by `Arduino_LED_Matrix`: the matrix
driver stopped with `end()`, the driver scanning a static frame, and the driver scanning while
QFabric writes changing frames at a controlled rate. The first hardware pass should test each
state individually and verify Bridge health after every transition:

```bash
qf-stage1 run led-profile \
  --led-mode disabled \
  --payload-size 8 \
  --iterations 20 \
  --warmup 5 \
  --timeout 2 \
  --output data/raw/smoke/led-disabled.jsonl \
  --profile-output data/raw/smoke/led-disabled-profile.json

qf-stage1 check --timeout 2

qf-stage1 run led-profile \
  --led-mode static \
  --payload-size 8 \
  --iterations 20 \
  --warmup 5 \
  --timeout 2 \
  --output data/raw/smoke/led-static.jsonl \
  --profile-output data/raw/smoke/led-static-profile.json

qf-stage1 check --timeout 2

qf-stage1 run led-profile \
  --led-mode refresh \
  --refresh-hz 60 \
  --payload-size 8 \
  --iterations 20 \
  --warmup 5 \
  --timeout 2 \
  --output data/raw/smoke/led-refresh-60hz.jsonl \
  --profile-output data/raw/smoke/led-refresh-60hz-profile.json

qf-stage1 check --timeout 2
```

Every run disables the matrix in cleanup, including after a measurement error. The profile JSON
records the requested mode and rate, actual frame-write count, observed write rate, and maximum
MCU-local `draw()` duration. After the smoke transitions pass, run the complete campaign:

```bash
QF_REPETITIONS=3 QF_ITERATIONS=1000 QF_WARMUP=100 \
  bash scripts/run-stage1-led-profile-campaign.sh \
  stage1-led-profiles-idle
```

The controlled 10, 30, and 60 Hz values are application frame-write rates, not claims about the
panel's optical scan or PWM frequency. The experiment measures whether driver state and changing
frame traffic affect Bridge latency, MCU loop gaps, or health.

Static flash and SRAM usage remain build outputs. Capture them whenever the firmware changes:

```bash
arduino-cli compile --json \
  --fqbn arduino:zephyr:unoq \
  benchmarks/stage1/mcu/stage1_probe \
  > data/raw/resources/mcu-build.json
```

In that JSON, `builder_result.executable_sections_size` is the machine-readable source for used
and maximum program and data sizes.

## Statistical analysis

```bash
qf-stage1 analyze \
  --input data/raw/rpc-roundtrip.jsonl \
  --json data/processed/rpc-roundtrip-summary.json \
  --csv data/processed/rpc-roundtrip-summary.csv
```

The analyzer reports total and successful sample counts, failure rate, minimum, p50, p95, p99,
maximum, mean, population standard deviation, and the achieved sequential call rate grouped by
experiment, payload size, and concurrency.
It keeps distinct `run_id` values separate so repeated runs cannot be silently pooled. For the
matrix experiment it also reports the MCU-returned `mcu_execution_us` distribution. That local
value measures the duration of the `Arduino_LED_Matrix.draw()` call; it does not claim to measure
the panel's complete optical refresh time.

Concurrency runs additionally report the measured batch wall time and aggregate attempt and
success rates. Use `concurrent_successes_per_second` for concurrent throughput. The generic
`sequential_calls_per_second` field is the reciprocal of mean per-call latency and is retained for
cross-experiment consistency; it is not aggregate throughput when `concurrency` is greater than
one.

For `mcu-linux-roundtrip`, the analyzer additionally reports `mcu_roundtrip_us`. This is measured
entirely with the MCU `micros()` clock around an MCU-originated call to the Linux-provided echo
handler, so it is the primary reverse-path metric. The ordinary `latency_ns` for that experiment
is Linux orchestration time covering the start request, reverse call, polling, and result request;
it is diagnostic rather than a one-way latency measurement. The Linux callback only returns the
token and must not make a nested Bridge call. If the Linux benchmark process is terminated while
the MCU is making its reverse call, that MCU call can remain blocked until the Router path is
recovered or the probe is reflashed.

## Clock rule

Linux `perf_counter_ns()` measures end-to-end call duration. MCU `micros()` is stored only as a local clock sample or local execution diagnostic. Do not subtract the two clocks. The reverse benchmark measures an MCU-clocked round trip, not one-way MCU-to-Linux latency. A one-way timing model requires a separate offset/drift method and uncertainty bound.

The clock-alignment experiment provides that bounded characterization without claiming that RPC
delay is symmetric. Each MCU `micros()` value is bracketed by Linux monotonic timestamps taken
immediately before and after its RPC. The midpoint is an offset estimate; half the complete RPC
interval is its uncertainty bound. The analyzer unwraps the 32-bit MCU microsecond counter,
regresses midpoint offset against Linux elapsed time, and reports a conservative drift interval
from the lowest-latency samples in the first and last 10% windows. Positive drift means the Linux
monotonic clock advances faster than the MCU clock under this definition.

Run a short smoke test first:

```bash
qf-stage1 run clock-align \
  --iterations 20 \
  --warmup 5 \
  --interval-ms 50 \
  --timeout 2 \
  --output data/raw/smoke/clock-alignment.jsonl

qf-stage1 analyze \
  --input data/raw/smoke/clock-alignment.jsonl \
  --json data/processed/smoke/clock-alignment.json \
  --csv data/processed/smoke/clock-alignment.csv

qf-stage1 check --timeout 2
```

After the smoke test passes, run three approximately five-minute repetitions:

```bash
bash scripts/run-stage1-clock-alignment-campaign.sh \
  stage1-clock-alignment-idle
```

The defaults are 600 samples at 500 ms spacing with ten warmups. Raw samples retain both Linux
bracket timestamps and the MCU timestamp. Absolute offset is specific to the two arbitrary clock
epochs; drift, uncertainty, and changes in offset are the portable results. Even after drift is
characterized, one-way latency must not be claimed more precisely than the reported alignment
uncertainty permits.

## Stage completion gate

Stage 1 is complete only when issue #2 contains:

- exact hardware and software versions;
- raw data and reproduction commands;
- at least three clean repetitions per configuration;
- idle and loaded results;
- payload and RPC-rate saturation behavior;
- clock limitations;
- MCU resource/headroom measurements;
- LED update overhead; and
- reviewed recommendations for later contract thresholds.

After all board results have been copied to the workstation, capture the final firmware build and
run the local evidence audit:

```bash
arduino-cli compile --json \
  --fqbn arduino:zephyr:unoq \
  benchmarks/stage1/mcu/stage1_probe \
  > data/raw/resources/mcu-build-stage1-final.json

qf-stage1 audit \
  --root . \
  --output data/processed/stage1-audit.json
```

The audit validates 136,800 expected samples, zero failures, campaign metadata, load-generator
logs, resource snapshots, the exact final build sizes, reproduction commands, and explicit
limitations. A `pass` report closes the local evidence gate; attach that report and
`docs/stage-1-findings.md` to issue #2 before closing the issue.

## Official references

- [UNO Q user manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/)
- [Arduino Router Bridge Python client](https://github.com/arduino/arduino-router-bridge-py)
- [Arduino Router service](https://github.com/arduino/arduino-router)
- [Arduino CLI sketch project format](https://arduino.github.io/arduino-cli/latest/sketch-project-file/)
