# Stage 9 physical observability

Stage 9 maps real QFabric telemetry onto the Arduino UNO Q 8×13 grayscale matrix and RGB devices.
It is an operator interface, not a research novelty claim. Display state must remain traceable to
persisted policy evidence and must not participate in recommendation or recovery decisions.

## Matrix ownership

The 13 columns are stable task slots numbered 0 through 12. A task keeps its slot for the lifetime
of a visualization session.

| Rows | Ownership | Meaning |
| --- | --- | --- |
| 0--2 | Linux | Linux placement, contract, or jitter state |
| 3--4 | RPC boundary | measured Bridge/IPC activity and transitions |
| 5--7 | RT MCU | RT placement, contract, or jitter state |

Pixel intensity is bounded to the matrix library's three-bit range, 0--7. The initial renderer
supports `placement`, `contracts`, `jitter`, `ipc`, and `off`. Placement is the combined default:
the active domain band uses contract severity and the center rows show measured IPC activity.

## Telemetry provenance

Each task snapshot requires a positive immutable Stage 8 `decision_id`, task and slot, current
domain and epoch, empirical contract state, measured jitter and its declared bucket, IPC activity,
and an event. Recovery telemetry is derived from the persisted controller outcome and execution
samples. The display cannot invent a switch, rollback, infeasibility, contract state, or timing
value that is absent from that record.

Jitter is the maximum minus minimum successful end-to-end sample in the recorded window. Its
bucket is relative to the recorded deadline: at most 2%, 5%, 10%, or above 10%. Missing or fewer
than two timings produce bucket zero rather than a fabricated estimate.

## Event grammar

Stable frames are temporarily overlaid for important events and then return to the selected view:

| Event | Matrix overlay |
| --- | --- |
| violation | maximum intensity in the current domain band |
| accepted transition | source band → bright RPC center → maximum destination band |
| commit | maximum destination band with a dimmer RPC acknowledgement |
| rollback | maximum failed-source band → bright RPC center → restored destination band |
| infeasible | alternating maximum/dim pixels down the task column |

An overlay carries the same decision ID and task slot as its source record. Rollback and forward
transition retain explicit source and destination domains rather than relying on animation
direction guesses.

## Update boundary

The pure renderer produces a complete 104-pixel frame. A separate diff operation emits only pixels
whose three-bit intensity changed. Identical frames therefore produce zero writes. The later
hardware worker owns buffering, event-overlay duration, rate limiting, and low-priority Bridge
delivery; none of those timing concerns are hidden inside policy evaluation. Its queue is bounded,
coalesces repeated task updates, and drops the oldest pending item when full. The MCU independently
maintains a single latest-frame slot protected by a Zephyr mutex. It applies at most one frame per
5--10 Hz refresh interval and redraws only when at least one pixel changed.

`off` always produces an all-zero frame and will disable periodic visualization work during
calibration and measurement.

## RGB semantics

The Linux user RGB reports health when the task is in the Linux domain and is off otherwise. The
MCU LED3 reports health when the task is in the RT domain and is off otherwise. For both, blue is
`UNKNOWN`, green is `SATISFIED`, yellow is `AT_RISK`, and red is `VIOLATED` or infeasible. MCU LED4
is activity: off is stable without measured IPC, blue is measured IPC activity, white is a
transition, green is commit, magenta is rollback, and red is an infeasible event. Event color is
temporary; the restored base frame retains health and current IPC state.

Linux writes are restricted to `red:user`, `green:user`, and `blue:user`. The panic, WLAN, and
Bluetooth LEDs are never reconfigured. The hardware campaign snapshots their trigger settings
before and after visualization and requires exact preservation.

## Operator commands

`qf view` consumes the immutable Stage 8 journal. A specific decision ID is recommended for an
auditable display; omitting it selects the latest record for the task.

```bash
qf view placement --decision 11 --history .qfabric/decisions.jsonl
qf view contracts --decision 6 --history .qfabric/decisions.jsonl
qf view jitter --decision 11 --history .qfabric/decisions.jsonl
qf view ipc --decision 6 --history .qfabric/decisions.jsonl
qf view off
```

The response includes the source decision ID, derived telemetry, base and overlay checksums, and
MCU diagnostics. A hardware acknowledgement is accepted only when its mode, decision ID, refresh
rate, and applied-frame checksum match the requested view.

The complete state campaign and paired overhead audit are reproducible with:

```bash
qf view-campaign \
  --history data/processed/stage8/stage8-decisions-01/decisions.jsonl \
  --refresh-hz 8 \
  --output data/processed/stage9/stage9-visualization-01/campaign.json

qf view-audit \
  --campaign data/processed/stage9/stage9-visualization-01/campaign.json \
  --disabled-profile data/processed/stage9/stage9-visualization-01/profile-disabled-1.json \
  --enabled-profile data/processed/stage9/stage9-visualization-01/profile-enabled-1.json \
  --output data/processed/stage9/stage9-visualization-01/stage9-audit.json
```

Repeat `--disabled-profile` and `--enabled-profile` in paired order for replicated experiments.
The audit rejects missing state or mode coverage, a nonblank off state, refresh rates outside the
declared range, invalid estimators, invocation failures, protected-task deadline misses, or a
median p95 regression above the declared budget.
