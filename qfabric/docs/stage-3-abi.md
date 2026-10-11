# QFabric ABI version 1

Stage 3 defines a deterministic cross-domain wire ABI. All multi-byte values use network byte
order (big endian), and no native structure padding is transmitted.

## Envelope

Every message begins with this packed 36-byte header:

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `QFAB` |
| 4 | 1 | protocol version | unsigned, currently `1` |
| 5 | 1 | message type | `1` request, `2` response |
| 6 | 1 | effect class | `1` pure, `2` idempotent, `3` stateful, `4` actuating |
| 7 | 1 | status | protocol status code |
| 8 | 4 | task ID | unsigned integer |
| 12 | 8 | invocation ID | unsigned integer |
| 20 | 4 | epoch | unsigned integer |
| 24 | 4 | contract ID | unsigned integer; zero means unspecified |
| 28 | 4 | relative deadline | unsigned microseconds; zero means unspecified |
| 32 | 2 | payload length | unsigned integer |
| 34 | 2 | flags | reserved; must be zero |

The maximum complete message is 1,024 bytes, matching the measured MCU decoder-buffer boundary.
Therefore the maximum payload is 988 bytes. Receivers reject oversized messages before payload
decoding and require the declared payload length to equal the received length.

## Value encoding

Supported scalars are signed and unsigned 8-, 16-, 32-, and 64-bit integers, IEEE 754 binary32
and binary64 finite floating-point values, and booleans encoded as exactly `00` or `01`.
Non-finite floats are rejected so NaN payload differences cannot make the encoding ambiguous.

Fixed arrays contain their elements consecutively with no length prefix. Struct fields appear in
declaration order with no alignment padding. POD values are finite compositions of these scalars,
fixed arrays, and fixed structs. Pointers, dynamic arrays, strings, recursive types, native object
representations, and dynamic object graphs are unsupported.

## Status values

| Value | Name | Meaning |
| ---: | --- | --- |
| 0 | OK | request or successful response |
| 1 | MALFORMED | invalid header or payload |
| 2 | OVERSIZED | message or encoded payload exceeds its limit |
| 3 | VERSION_MISMATCH | unsupported protocol version |
| 4 | UNKNOWN_TASK | task ID is not registered |
| 5 | STALE | epoch is older than the receiver epoch |
| 6 | DUPLICATE | invocation was already accepted in the current replay window |
| 7 | EXECUTION_ERROR | task execution failed |

## Effects and recovery safety

Every task has one effect class. A declaration without an explicit effect defaults to `STATEFUL`,
which is the safe pinned default. Only `Q_PURE` tasks are eligible for automatic canary execution.
`Q_IDEMPOTENT` may be retried under an explicit policy, while `Q_STATEFUL` and `Q_ACTUATING` remain
pinned unless a later declaration supplies explicit state-transition hooks.

## Epoch and duplicate rules

A receiver keeps a bounded replay window per task. A higher epoch clears the window and becomes
current. A lower epoch is stale. A repeated invocation ID within the current epoch is a duplicate.
The initial reference window retains 64 accepted invocation IDs; this bound must be declared by a
runtime rather than silently expanded.

Both the reference implementation and generated C++ codec expose the same replay semantics. The
MCU probe resets its bounded window, accepts an invocation, rejects its duplicate, rejects a lower
epoch, and accepts the same invocation ID again after advancing to a new epoch.

The probe also executes minimum, maximum, and signed-zero round trips for every supported scalar
width on the MCU. The same helper is compiled and executed by the native and ARM64 golden-vector
runner.

The canonical machine-readable declarations are in `config/qfabric-abi.json`.

Validate the declarations and regenerate the canonical vectors with:

```bash
qf abi check
qf abi vectors
qf abi generate
qf abi compile-fail
```

The committed `abi/golden-vectors.json` file is the language-independent source of truth for the
Linux and MCU codec tests. Implementations must match its payload and complete-frame bytes; they
must not generate expectations from one target and use those expectations to validate the other.
The generated `generated/qfabric_abi.hpp` codec uses explicit byte readers and writers rather than
copying C++ object representations. Both targets compile this same header.
The compile-fail suite proves that dynamic arrays, pointers, recursive declarations, oversized
payloads, and unknown effect classes are rejected before target compilation.

After installing the Stage 3 firmware, compare the MCU output with the independent committed
vectors and exercise its defensive decoder with:

```bash
qf abi probe --output data/processed/stage3-mcu-abi-probe.json
```

## Completion audit

Run the final audit on the UNO Q after copying the ARM64 runner and installing the Stage 3
firmware:

```bash
qf abi audit --output data/processed/stage3-audit.json
```

The audit regenerates the C++ header and golden vectors in memory, runs all compile-fail cases,
executes the real ARM64 runner, repeats the live MCU vectors and safety scenarios, and verifies
the effect-policy invariants. Stage 3 is complete only when this command reports `pass`.

The accepted implementation and evidence are summarized in
[the Stage 3 findings](stage-3-findings.md).
