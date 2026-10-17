# RV565 board measurements

Run the read-only hardware probe from the repository root:

```bash
./tools/probe_board.py --port /dev/ttyACM0
```

The script records a timestamped esptool transcript and JSON summary here. It
uses only `chip_id`, `flash_id`, and `get_security_info`; it never erases,
writes, or reads flash contents. By default it redacts the board's unique MAC
address so that logs can be reviewed or published safely. Use
`--include-identifiers` only when a private inventory record requires it.

Keep the raw transcript and summary paired with the repository revision used
for the experiment. Runtime measurements such as frame latency, achieved FPS,
input response, memory high-water marks, and power require the separate RV565
benchmark firmware; esptool cannot measure those quantities.

While OreoOS is running, capture the interpreter, CPU clock, filesystem and
capability-specific heap state without modifying the badge:

```bash
./tools/probe_runtime.py --port /dev/ttyACM0
```

This second probe also hashes the matching local `sdkconfig` when it can find
the reproducible firmware build directory. The hash identifies host build
configuration; it is valid for the badge only when that build was the image
actually flashed for the experiment.

After backing up the complete badge and flashing the instrumented standalone
firmware, collect a fixed-window run with:

```bash
.venv/bin/python tools/collect_video_benchmark.py --port /dev/ttyACM0
```

The timed window contains no serial logging. The collector requires a complete
numbered frame sequence before it emits a JSON summary and percentile-ready
CSV, preventing truncated terminal output from becoming a paper result.

Aggregate repeated runs only when their application, media and configuration
hashes agree:

```bash
python3 tools/summarize_video_benchmarks.py \
  paper/measurements/video-benchmark-native-dma-stripes-*.json
```

The aggregator validates every numbered frame, pools frame-latency
percentiles, and calculates two-sided 95% Student-t intervals over independent
run-level measurements.
