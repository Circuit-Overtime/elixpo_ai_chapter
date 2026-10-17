# Stage 1 findings

**Stage 1 status: complete with documented platform limitations (2026-10-09).**

No timing contract is selected in this document. These results establish the initial natural
idle and CPU-loaded behavior of one Arduino UNO Q configuration and identify follow-up controls.

## Evidence

- Idle campaign: `stage1b-directional-idle`, QFabric commit `c246e8d`, three repetitions.
- Loaded campaign: `stage1b-directional-cpu-loaded`, the same commit, three repetitions.
- Performance-governor campaigns: `stage1-performance-idle` and
  `stage1-performance-cpu-loaded`, QFabric commit `1cef3ad`, three repetitions each. The
  benchmark and MCU probe were unchanged from `c246e8d`; the later commit added the safe
  governor wrapper.
- Idle concurrency campaign: `stage1-concurrency-idle`, QFabric commit `931dbb8`, three
  repetitions each at 1, 2, 4, and 8 workers with an 8-byte payload.
- CPU-loaded concurrency campaign: `stage1-concurrency-cpu-loaded`, QFabric commit `bc559fb`,
  the same repetitions, worker levels, and payload. Its four `stress-ng` CPU workers completed
  successfully over 138.12 seconds with no failed or untrustworthy stress metrics.
- Idle LED activity campaign: `stage1-led-profiles-idle`, QFabric commit `c091c2b`, three
  repetitions each with matrix scanning disabled, a static enabled frame, and changing frames
  requested at 10, 30, and 60 Hz.
- Idle clock-alignment campaign: `stage1-clock-alignment-idle`, QFabric commit `708c081`, three
  repetitions of 600 samples at 500 ms spacing. Each repetition spanned about 305.2 seconds.
- Each of the four conditions contains 24,000 recorded samples with zero failures, including
  3,000 MCU-initiated round trips: 96,000 samples in total.
- Loaded profile: `stress-ng --cpu 4 --cpu-method all`, successful for 414.70 seconds.
- The performance-governor loaded profile used the same four workers and completed successfully
  in 427.07 seconds. Both performance campaign captures reported a 2.016 GHz current frequency,
  and the wrapper restored `schedutil` afterward.
- Raw and processed data are retained on the UNO Q and backed up under the matching local
  `data/` paths, which remain intentionally untracked.
- Across the baseline, controlled-governor, concurrency, LED, and clock campaigns, the retained
  evidence contains 136,800 measurements with zero failed samples.

The table reports the mean of each repetition's percentile. Times are end-to-end Linux-observed
RPC latency.

| Experiment | Bytes | Idle p50 ms | Loaded p50 ms | Idle p95 ms | Loaded p95 ms | Idle p99 ms | Loaded p99 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| Clock sample | 0 | 8.34 | 7.18 | 8.89 | 10.86 | 9.11 | 12.57 |
| Matrix update | 0 | 8.80 | 7.98 | 9.60 | 11.86 | 9.96 | 12.97 |
| Reverse orchestration | 0 | 23.60 | 27.03 | 32.64 | 33.16 | 33.47 | 35.34 |
| RPC echo | 0 | 7.74 | 6.49 | 8.85 | 10.11 | 9.11 | 11.80 |
| RPC echo | 1 | 8.06 | 6.50 | 8.99 | 10.42 | 9.26 | 12.00 |
| RPC echo | 8 | 9.81 | 7.84 | 10.46 | 11.68 | 10.66 | 13.08 |
| RPC echo | 32 | 14.45 | 13.47 | 15.43 | 17.04 | 15.89 | 19.10 |
| RPC echo | 128 | 32.93 | 32.10 | 34.04 | 35.90 | 34.82 | 37.15 |

The corresponding performance-governor measurements are below. They use the same aggregation
rule and units.

| Experiment | Bytes | Idle p50 ms | Loaded p50 ms | Idle p95 ms | Loaded p95 ms | Idle p99 ms | Loaded p99 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| Clock sample | 0 | 7.56 | 7.56 | 8.45 | 11.00 | 8.78 | 12.93 |
| Matrix update | 0 | 8.06 | 7.97 | 9.38 | 11.53 | 9.61 | 12.66 |
| Reverse orchestration | 0 | 22.12 | 27.96 | 30.80 | 33.82 | 31.62 | 35.64 |
| RPC echo | 0 | 7.29 | 6.55 | 7.89 | 10.53 | 8.14 | 12.10 |
| RPC echo | 1 | 7.51 | 7.47 | 7.99 | 11.42 | 8.29 | 12.81 |
| RPC echo | 8 | 8.98 | 8.88 | 9.58 | 12.91 | 9.92 | 14.33 |
| RPC echo | 32 | 14.27 | 13.56 | 14.94 | 17.48 | 15.11 | 19.01 |
| RPC echo | 128 | 32.53 | 32.23 | 33.60 | 35.84 | 33.98 | 37.60 |

The reverse-path primary metric is a complete MCU-clocked MCU→Linux→MCU round trip. It is
not a one-way latency estimate. As above, each entry is the mean of the three repetition-level
statistics.

| Governor and condition | MCU p50 ms | MCU p95 ms | MCU p99 ms | MCU mean ms |
|---|---:|---:|---:|---:|
| `schedutil`, idle | 9.23 | 12.79 | 12.95 | 10.07 |
| `schedutil`, CPU-loaded | 10.55 | 13.58 | 15.80 | 9.60 |
| `schedutil` loaded change | +14.2% | +6.2% | +22.0% | -4.6% |
| `performance`, idle | 8.14 | 11.89 | 11.96 | 9.34 |
| `performance`, CPU-loaded | 10.57 | 14.29 | 16.17 | 9.76 |
| `performance` loaded change | +29.9% | +20.2% | +35.2% | +4.5% |

Concurrency results report the mean of each campaign's three repetition-level values. Throughput
is measured from the complete batch wall time rather than inferred from mean per-call latency.

| Workers | Idle success/s | Loaded success/s | Change | Idle p50 ms | Loaded p50 ms | Idle p99 ms | Loaded p99 ms |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 96.75 | 104.67 | +8.2% | 9.42 | 8.46 | 10.63 | 13.63 |
| 2 | 148.15 | 155.99 | +5.3% | 12.08 | 10.97 | 13.51 | 16.63 |
| 4 | 205.68 | 212.00 | +3.1% | 17.12 | 16.10 | 19.28 | 21.99 |
| 8 | 257.31 | 261.92 | +1.8% | 26.25 | 25.84 | 30.74 | 33.79 |

The LED table reports Linux-observed 8-byte echo latency. Rates in parentheses are achieved
application frame writes measured by the MCU; they are not the panel's optical scan frequency.

| Matrix profile | Mean p50 ms | Mean p95 ms | Mean p99 ms | Maximum ms | Mean call rate/s |
|---|---:|---:|---:|---:|---:|
| Driver disabled | 9.59 | 10.22 | 10.45 | 11.04 | 104.95 |
| Static enabled | 9.73 | 10.41 | 10.63 | 11.13 | 103.48 |
| 10 Hz requested (9.87 Hz) | 9.75 | 10.39 | 10.58 | 18.56 | 103.45 |
| 30 Hz requested (28.83 Hz) | 9.73 | 10.41 | 10.62 | 12.96 | 103.49 |
| 60 Hz requested (55.67 Hz) | 9.74 | 10.40 | 10.60 | 11.36 | 103.41 |

Clock drift is the slope of Linux-monotonic-minus-MCU time against Linux elapsed time. Positive
values mean Linux monotonic time advances faster. Each endpoint interval uses the lowest-latency
sample in the first and last 10% windows; alignment uncertainty is half the complete RPC interval.

| Repetition | Regression drift ppm | Endpoint lower ppm | Endpoint upper ppm | Best uncertainty ms | Median uncertainty ms | p99 uncertainty ms |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 947.71 | 918.77 | 976.44 | 3.81 | 4.44 | 4.70 |
| 2 | 924.25 | 891.45 | 954.18 | 3.77 | 4.45 | 4.73 |
| 3 | 913.90 | 891.66 | 946.08 | 3.71 | 4.45 | 4.67 |

## Observations

- Under `schedutil`, CPU load reduced Linux-initiated median latency by 2.5% to 20.1%, but
  increased p95 by 5.5% to 23.5% and p99 by 6.7% to 37.9%.
- With `schedutil`, improved loaded medians were partly confounded by frequency scaling. Under
  the `performance` governor, load changed Linux-initiated payload medians by -10.1% to -0.5%,
  while increasing p95 by 6.7% to 42.9% and p99 by 10.7% to 54.6%. Frequency policy therefore
  does not explain the tail degradation; scheduling or Router contention remains the leading
  interpretation, not yet a causal attribution.
- The MCU-local median duration of `Arduino_LED_Matrix.draw()` was 7 microseconds in both
  conditions. Matrix RPC tail inflation is therefore outside the measured draw call itself.
- The reverse-path result was stable between repetitions: idle p50 varied from 9.225 to
  9.242 milliseconds and loaded p50 from 10.540 to 10.556 milliseconds. CPU load increased
  the MCU-clocked p50, p95, and p99, while reducing the mean. This is not contradictory: the
  loaded distribution shifted into distinct fast and slow regions, with samples below 8 ms
  rising from 6.1–11.9% at idle to 34.5–37.3% under load. A single mean would conceal that shape.
- Linux reverse orchestration time is diagnostic rather than the primary reverse metric. Its
  loaded p50, p95, and p99 increased by 14.6%, 1.6%, and 5.6%, respectively.
- At idle, `performance` reduced the MCU-clocked reverse p50 by 11.9% and p99 by 7.6% relative
  to `schedutil`. Under CPU load, changing from `schedutil` to `performance` changed reverse p50
  by only +0.2% and p99 by +2.4%. The fixed-policy load penalty and bimodal shape therefore
  persisted: 31.5–36.7% of loaded samples were below 8 ms, while 43.9–50.2% were between 10 and
  12 ms.
- The environment capture sampled 2.016 GHz at the beginning of both `performance` campaigns,
  but did not continuously record frequency residency. The result controls governor policy, not
  a separately verified per-sample clock frequency.
- Idle sequential echo rate fell from about 129 calls/s at zero-byte payload to about 30 calls/s
  at 128 bytes.
- Payloads through 128 bytes completed cleanly. An initial 256-byte probe produced sustained
  timeouts and eventually required MCU firmware re-registration. Sizes at and above 256 bytes
  are isolated from baseline campaigns until a reset-safe boundary method is implemented.
- A bounded runtime allocation probe successfully allocated and released 8 KiB from the Zephyr
  kernel heap and 32 KiB from the C-library heap, but the MCU later stopped producing all RPC
  responses while the Linux Router remained active and accepted client connections. Treat runtime
  allocator probing as unsafe on the stock image; the successful allocations are not accepted as
  safe-headroom limits.
- The idle concurrency campaign completed 12,000 measured calls without failures, and every
  post-level Bridge health check passed. Mean aggregate throughput across the three repetitions
  was 96.75, 148.15, 205.68, and 257.31 successful calls/s at 1, 2, 4, and 8 workers. Relative to
  one worker, eight workers delivered 2.66 times the throughput while mean p50 per-call latency
  increased from 9.42 ms to 26.25 ms and mean p99 from 10.63 ms to 30.74 ms. Throughput varied by
  less than 1% within every worker level, supporting repeatability. Scaling is beneficial but
  sublinear; eight workers are the highest verified level, not an asserted saturation boundary.
- The matched loaded concurrency campaign also completed 12,000 calls without failures or health
  loss. Load increased aggregate throughput by 1.8% to 8.2% and reduced median per-call latency by
  1.6% to 10.2%, consistent with the earlier `schedutil` frequency-response observation. It still
  increased p99 by 9.9% to 28.2% depending on worker count. One two-worker call reached 115.82 ms,
  compared with a 22.09 ms maximum at one worker in the idle campaign. CPU load therefore improves
  central throughput while worsening tail risk; later contracts must not be selected from the
  throughput or median alone.
- Every post-level diagnostic reported exactly 1,101 requests since reset: 100 warmups, 1,000
  measured calls, and one health check. The largest observed MCU main-loop gap was 5.224 ms at
  idle and 5.222 ms under load, and all 24 post-level health checks passed.
- All 15 LED profile runs completed 15,000 measured calls without a failure or post-profile health
  loss. Enabling matrix scanning increased mean repetition-level p50 by about 1.5% and reduced
  sequential call rate by about 1.4% relative to the disabled driver. Static, 10 Hz, 30 Hz, and
  60 Hz profiles were effectively indistinguishable at p50 through p99, so the dominant measured
  cost is enabling matrix scanning rather than changing the frame-write rate in this range.
- The MCU achieved 9.87, 28.83, and 55.67 application frame writes/s for the requested 10, 30,
  and 60 Hz profiles. The scheduler intentionally does not issue catch-up bursts, so missed loop
  deadlines reduce achieved rate. The worst local `Arduino_LED_Matrix.draw()` call was 18 us,
  while post-profile maximum loop gaps ranged from 3.711 to 4.041 ms. These measurements do not
  establish optical refresh or PWM timing.
- All 1,800 long-duration clock-alignment samples completed without failure or health loss. The
  three regression estimates ranged from 913.90 to 947.71 ppm, with a mean of 928.62 ppm. All
  endpoint-derived intervals overlap from 918.77 to 946.08 ppm, supporting a persistent clock-rate
  difference rather than short-run RPC noise. At the mean estimate, uncorrected Linux-versus-MCU
  offset changes by about 0.93 ms/s, or 279 ms over five minutes.
- The lowest observed per-sample alignment uncertainty ranged from +/-3.71 to +/-3.81 ms across
  repetitions, and median uncertainty was about +/-4.44 ms. Drift correction is therefore
  necessary for comparisons over time, but this RPC bracketing method still cannot justify a
  sub-millisecond one-way latency claim. No MCU 32-bit microsecond wrap occurred during an
  individual run; the analyzer's wrap path remains covered by synthetic tests.
- The final LED-profile firmware build uses 103,892 of 786,432 flash bytes (13.2%) and 41,508 of
  262,144 global-data bytes (15.8%). Safe MCU introspection reports configured 32 KiB kernel heap,
  32 KiB main stack, 500-byte Bridge thread stack, 1,024-byte decoder buffer, and 256-byte RPC
  request buffer. Runtime stack watermark, heap utilization, and direct RouterBridge queue depth
  are unavailable in the stock UNO Q Zephyr configuration; practical queue behavior is represented
  by the bounded concurrency campaigns and loop-gap diagnostics.

## Recommendations for later contract stages

- Treat 128 bytes as the largest demonstrated-safe application payload. Do not advertise support
  above it until a reset-safe recovery mechanism exists.
- Use separate idle and loaded p99 distributions when proposing latency thresholds. Do not derive
  a contract from means or from the frequency-assisted loaded medians.
- Use four concurrent callers as the initial contract-design operating point. Eight is verified
  but has substantially higher tail latency and only 2.66 times single-worker throughput.
- Budget the roughly 1.5% matrix-scanning latency effect, but do not add a rate-dependent penalty
  for 10-60 application frame writes/s unless later workloads contradict this result.
- Keep cross-domain claims round-trip based. If a later design needs one-way timing, compensate
  the observed clock drift and retain at least the measured alignment uncertainty.
- Treat configured memory capacities and build sizes as bounds, not live free-memory guarantees.

## Accepted limitations and deferred work

- The exact failure boundary between 128 and 256 payload bytes is deliberately unresolved. A
  256-byte probe caused sustained loss of MCU RPC service, so further boundary work is deferred
  until recovery can be automated and isolated from baseline firmware.
- The loaded reverse-path bimodality is characterized but not causally attributed. Router or
  scheduler tracing and continuous frequency telemetry are deferred; later contracts must use its
  measured distribution rather than an assumed cause.
- Live MCU stack, heap, thread-utilization, and direct queue-depth counters are unavailable without
  a custom Zephyr build. Stage 1 retains the stock-platform capacities, build usage, loop gaps,
  bounded concurrency results, and unsafe-allocation negative result instead of fabricating live
  headroom values.
