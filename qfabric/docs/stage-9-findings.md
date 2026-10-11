# Stage 9 findings

Stage 9 is complete. QFabric now presents real, decision-linked runtime state on the Arduino UNO Q
8×13 grayscale matrix, Linux user RGB, and two MCU RGB devices while preserving Linux system LED
behavior. The interface is a physical debugger, not part of the placement policy or the research
novelty claim. Its final hardware campaign and independent audit passed on the UNO Q.

## Accepted design

The 13 matrix columns are stable QTask slots. Rows 0--2 belong to Linux, rows 3--4 show the RPC
boundary, and rows 5--7 belong to the RT MCU. The supported views are placement, contracts,
jitter, IPC, and off. Every non-off frame is derived from one immutable Stage 8 decision and carries
that decision's stable identifier through submission and MCU acknowledgement.

The contracts view distinguishes `UNKNOWN`, `SATISFIED`, `AT_RISK`, and `VIOLATED` by intensity.
Accepted transitions, rollback, and infeasibility use temporary directional overlays before the
base state is restored. Jitter buckets come only from recorded successful execution samples and
their recorded deadline. IPC is shown only when the record contains measured execution evidence.

The Linux user RGB reports health only for Linux placement; MCU LED3 reports health only for RT
placement. Their health colors are blue, green, yellow, or red. MCU LED4 reports activity: off,
blue IPC, white transition, green commit, magenta rollback, or red infeasibility. QFabric writes
only the Linux `*:user` channels. It never writes the panic, WLAN, or Bluetooth LEDs. The CLI,
matrix, and RGB outputs are therefore different projections of the same persisted telemetry rather
than separate state machines.

## Bounded update path

The Linux worker has a bounded queue, coalesces repeated task updates, and drops the oldest pending
item under pressure. Rendering is pure and computes changed pixels separately. The MCU stores only
the newest pending 104-pixel frame under a Zephyr mutex and applies frames at a configured 5--10 Hz.
It compares the frame with the currently displayed values and calls the matrix driver only when a
pixel changed.

`qf view off` blanks the matrix, disables its periodic refresh, clears both RGB devices, and is used
before calibration. The final campaign ended in this state. Firmware diagnostics expose submitted,
applied, and coalesced frames; changed pixels; last decision ID; current checksum; refresh rate; and
last and maximum draw duration.

## Hardware coverage

The final campaign used the real 16-record Stage 8 journal and passed nine cases plus the off-state
check. Stable decision IDs grounded each required outcome:

| Physical behavior | Decision ID | Recorded evidence |
| --- | ---: | --- |
| stable satisfied placement | 1 | selected Linux recommendation |
| accepted Linux-to-RT transition | 2 | move accepted |
| unknown contract | 3 | recommendation withheld for insufficient evidence |
| at-risk contract and active IPC | 6 | measured recovery observation |
| violated contract | 12 | measured post-rollback observation |
| recovered satisfied contract | 14 | measured cooldown completion |
| measured jitter and rollback | 11 | real failed probation rollback |
| infeasible event | 15 | labelled controller infeasibility entry |

Placement, contracts, jitter, and IPC modes all returned the expected source decision, semantic
state, event, mode identifier, 8 Hz target, and MCU frame checksum. The off response reported mode
zero, refresh zero, checksum zero, and all QFabric-controlled RGB channels off. Linux user and MCU
health readback matched the active domain for every case. The panic/WLAN/Bluetooth trigger snapshots
were identical before and after the campaign. The maximum observed matrix draw was 7 microseconds.

## Controlled overhead experiment

The overhead campaign used three paired repetitions. Each condition retained 500 full-profile
observations per domain after 50 warm-up invocations. Visualization-disabled runs were paired with
the contracts view for decision 6 active at 8 Hz. Across both domains and conditions this produced
6,000 retained protected-`add` observations and 600 warm-ups.

| Domain | Disabled median mean | Enabled median mean | Mean delta | Disabled median p95 | Enabled median p95 | p95 delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux | 7.734 ms | 7.731 ms | -0.04% | 8.016 ms | 7.974 ms | -0.53% |
| RT | 10.409 ms | 10.549 ms | +1.35% | 11.306 ms | 11.538 ms | +2.05% |

All 6,000 retained observations completed successfully and met the inclusive 20 ms protected
deadline. Every estimator was valid. Both median p95 changes remained within the audit's 15%
regression budget. The small negative Linux deltas are normal run-to-run variation and are not
evidence that visualization improves performance.

## Independent audit

The final audit was captured at `2026-10-09T08:11:44.179168+00:00`. All nine checks passed:

- hardware campaign status;
- complete mode coverage;
- complete contract-state coverage;
- stable, transition, rollback, and infeasible event coverage;
- bounded 5--10 Hz refresh;
- blank, disabled off mode;
- preservation of the Linux panic, WLAN, and Bluetooth triggers;
- healthy protected contracts with valid estimators and no failures or misses; and
- visualization p95 overhead within budget.

The hardware-independent suite contained 154 passing tests at completion. It includes negative
coverage for false infeasible rendering of insufficient evidence, incomplete campaign coverage,
invalid off state, cross-domain RGB leakage after an overlay, protected deadline regression, and
excess overhead.

## Claim boundary and limitations

The LEDs are a compact diagnostic encoding, not a substitute for the persisted journal or CLI.
Only one task is currently active, although the renderer reserves 13 stable slots and rejects slot
collisions. The campaign validates protocol-level RGB values and MCU acknowledgements; it does not
include calibrated photometry, camera-based color recognition, operator-response studies, power
measurements, or accessibility evaluation.

The paired profiles measure an enabled, stable 8 Hz view and the measured cost of changed-frame
draws. They do not establish overhead for an adversarial stream that changes every task on every
refresh. Coalescing intentionally makes intermediate display frames lossy while the decision
journal remains authoritative and complete. The 15% p95 budget is an engineering acceptance bound,
not a statistical equivalence claim.

## Next stage

Stage 10 will add only the kernel/eBPF instrumentation justified by unresolved evidence needs,
while preserving the audited policy, recovery, decision-history, and observability boundaries.
