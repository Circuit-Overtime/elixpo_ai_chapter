# Stage 3 findings

Stage 3 is complete. QFabric now has a deterministic, versioned ABI; generated cross-target
serialization; explicit recovery effect classes; and bounded stale/duplicate protection. The
final audit passed on the Arduino UNO Q with no failures.

## Accepted ABI

Protocol version 1 uses a packed 36-byte, big-endian envelope. It carries the message type, effect
class, status, task ID, invocation ID, epoch, contract ID, relative deadline, payload length, and
reserved flags. Complete messages are limited to 1,024 bytes, leaving a maximum payload of 988
bytes at the measured MCU decoder boundary.

The supported value model contains:

- signed and unsigned 8-, 16-, 32-, and 64-bit integers;
- finite IEEE 754 binary32 and binary64 values;
- canonical booleans;
- fixed-size arrays;
- fixed-size structs; and
- POD compositions of those types.

Pointers, dynamic arrays, recursive types, oversized payloads, and unknown effect declarations
are rejected before target compilation.

## Cross-target result

The canonical schema SHA-256 is
`677a92704da9e3dd60d632a67be61908aa1a1943e1590e8b69b03d88058726cf`.
The generated codec and golden vectors were current at audit time.

The genuine AArch64 runner exited successfully with:

```text
QFabric C++ ABI golden vectors passed
```

The STM32 produced byte-for-byte matches for all three committed complete-frame vectors:

- integer-boundary `AddRequest`;
- composite `ProbeRequest` containing integers, floats, an array, and a boolean; and
- `ProbeResponse`.

Every integer width was exercised at its minimum and maximum. Both floating widths were tested at
their finite extrema and with signed zero. The same C++ boundary helper passed on ARM64 and the
STM32.

The final firmware used 98,168 bytes of program storage and 40,928 bytes of global dynamic memory.

## Defensive behavior

The MCU returned the specified status for every defensive scenario:

| Scenario | Status |
| --- | ---: |
| valid message | 0 (`OK`) |
| malformed boolean | 1 (`MALFORMED`) |
| short header | 1 (`MALFORMED`) |
| reserved flags | 1 (`MALFORMED`) |
| oversized message | 2 (`OVERSIZED`) |
| protocol-version mismatch | 3 (`VERSION_MISMATCH`) |
| stale epoch | 5 (`STALE`) |
| duplicate invocation | 6 (`DUPLICATE`) |

Advancing the epoch cleared the bounded replay window and allowed the same invocation ID again.

## Effect policy

The ABI exposes `Q_PURE`, `Q_IDEMPOTENT`, `Q_STATEFUL`, and `Q_ACTUATING`. A task without an
explicit effect receives the safe `STATEFUL` default. Only pure tasks are eligible for automatic
canary execution. Stateful and actuating tasks remain pinned unless explicit transition hooks are
declared.

Both current tasks (`add` and `abi_probe`) are explicitly pure and passed the pure-only canary
invariant.

## Completion evidence

The final audit was captured at `2026-10-09T04:39:31.026915+00:00`. It recorded:

- Stage 3 status `pass` with no failures;
- five passing compile-fail cases;
- current generated codec and golden vectors;
- a passing real AArch64 runner;
- three matching MCU golden vectors;
- six passing defensive-decoder scenarios;
- four passing replay-window transitions; and
- passing MCU scalar-boundary coverage.

The hardware-independent suite contained 54 passing tests at completion.

## Deferred to Stage 4

Stage 3 defines identity and contract metadata but does not aggregate timing measurements. Stage 4
will correlate invocations across domains, distinguish Linux end-to-end timing from MCU-local
diagnostics, expose estimator validity, and quantify instrumentation overhead.
