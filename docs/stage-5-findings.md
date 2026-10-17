# Stage 5 findings

Stage 5 is complete. QFabric now converts correlated timing samples into deterministic empirical
soft real-time contract states, reports the evidence and confidence behind each decision, and
replays the same trace without changing its result. The final Arduino UNO Q audit passed with no
failures.

## Accepted contract

The first-paper contract uses an inclusive end-to-end deadline and an allowed observed miss rate.
Its version 1 policy fixes warm-up, non-overlapping windows, minimum evidence, missing-sample
behavior, violation persistence, recovery hysteresis, and empirical infeasibility.

The completion campaign used:

- a 20 ms inclusive Linux-clock end-to-end deadline;
- 100 retained observations per evaluation window;
- a 1% maximum observed miss rate and 0.5% at-risk threshold;
- a 0.25% recovery threshold;
- three consecutive violating windows for `VIOLATED`;
- three consecutive recovery-quality windows to return to `SATISFIED`; and
- five consecutive 100%-miss windows for `INFEASIBLE`.

Timeout, error, and missing observations conservatively count as deadline misses. A state changes
only at a complete-window boundary. Every decision remains an empirical assessment rather than a
formal WCET claim.

## Hardware evidence

The campaign retained 1,000 untouched full-instrumentation observations in each execution domain
after 100 warm-up invocations. There were no invocation failures, deadline misses, incomplete
windows, or dropped samples.

| Domain | Mean | p50 | p95 | p99 | Maximum | 20 ms misses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux | 7.745 ms | 7.786 ms | 8.047 ms | 8.173 ms | 8.279 ms | 0/1,000 |
| RT | 10.234 ms | 10.238 ms | 11.265 ms | 11.585 ms | 11.792 ms | 0/1,000 |

Both traces produced ten complete windows. Every window observed a 0% miss rate, so both domains
entered and remained `SATISFIED`. Replaying the persisted traces reproduced the reports exactly.

The 27 window/hysteresis configurations evaluated for each domain all ended `SATISFIED`, giving 54
deterministic sensitivity results over the same untouched observations.

## Confidence interpretation

Each 100-observation, zero-miss window has a Wilson-score 95% miss-rate interval with an upper
bound of approximately 3.70%. The state machine intentionally applies the declared observed-rate
thresholds and reports this interval alongside the decision. Consequently, `SATISFIED` means the
observed window met the empirical policy; it does not prove that the underlying miss probability
is below 1%, and it is not a hard real-time guarantee.

## Transition and hysteresis evidence

Controlled traces were generated separately for Linux and RT from successful hardware latency
values. They are permanently marked as injected state-machine validation, not hardware
performance evidence. Both scenario audits passed the same sequence:

| Phase end | Expected behavior | Observed state |
| --- | --- | --- |
| baseline window 1 | healthy evidence | `SATISFIED` |
| isolated-spike window 2 | no violation | `AT_RISK` |
| recovery window 5 | three recovery windows | `SATISFIED` |
| sustained-violation window 8 | three 2%-miss windows | `VIOLATED` |
| recovery window 11 | three recovery windows | `SATISFIED` |
| total-failure window 16 | five 100%-timeout windows | `INFEASIBLE` |
| final-recovery window 19 | three recovery windows | `SATISFIED` |

This covers `UNKNOWN`, `SATISFIED`, `AT_RISK`, `VIOLATED`, and `INFEASIBLE`. The isolated spike
did not produce a violation, sustained misses were detected at the declared bound, interrupted
recovery reset its streak in the unit trace, and recovery hysteresis prevented single-window
oscillation.

## Completion evidence

The final audit was captured at `2026-10-09T05:40:28.147222+00:00`. It recorded:

- Stage 5 status `pass` with no failures;
- 2,000 untouched hardware observations and 20 complete contract windows;
- valid `SATISFIED` reports for Linux and RT;
- 54 sensitivity configurations across both domains;
- exact deterministic replay of both hardware traces;
- safe provenance labels on both controlled-injection traces;
- passing controlled phase checks in both domains; and
- complete five-state coverage.

The hardware-independent suite contained 86 passing tests at completion.

## Deferred to Stage 6

Stage 5 describes whether each measured domain satisfies a contract. It does not recommend a
domain or change placement. Stage 6 will compare total end-to-end behavior, apply evidence,
semantic, admission, feasibility, and cooldown gates, account for supported chain-boundary costs,
and explain every rejected alternative. Recommendation remains advisory; live placement changes
are outside Stage 6.
