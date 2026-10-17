# Stage 2 findings

Stage 2 is complete. It demonstrates one logical QTask executing correctly in both physical
execution domains on the Arduino UNO Q without presenting the STM32 as a Linux processor or
introducing automatic placement policy.

## Accepted result

The single `qtasks/add.qtask.h` declaration produced two target-specific artifacts:

- a 64-bit ARM AArch64 Linux executable; and
- an Arduino Zephyr firmware image for the STM32U585 Cortex-M33.

The RT image used 85,200 bytes of program storage and 34,404 bytes of global dynamic memory. The
build report identified both targets independently and recorded a passing architecture check for
each artifact.

On the UNO Q, the required commands returned identical results:

```text
qf run add --domain linux -- 2 3  -> 5
qf run add --domain rt -- 2 3     -> 5
```

The non-interactive smoke test also confirmed that both domain selections reject an invalid
argument count with the same message and exit unsuccessfully.

## Completion audit

The final audit was captured on an AArch64 UNO Q host at `2026-10-09T04:15:00.887565+00:00`.
It recorded:

- a valid passing dual-target build report;
- a genuine AArch64 Linux artifact;
- Linux result `5` and RT result `5` for arguments `2` and `3`;
- identical Linux and RT validation failures;
- no audit failures; and
- source declaration SHA-256
  `64d7ac8008264b48f7d32e3b9efbd05011b8d920328a86bc015c0126ca393f32`.

The hardware-independent suite contained 33 passing tests at completion.

## Architecture boundary

Stage 2 intentionally keeps domain selection explicit. The Linux path launches a native ARM64
process, while the RT path invokes a separately registered RouterBridge method on the STM32. The
shared declaration defines task behavior, but each domain retains its real toolchain, runtime, and
failure boundary.

Uploading the Stage 2 firmware replaces the Stage 1 measurement endpoints. An unavailable
`qf_stage1_echo` after this upload is therefore expected and is not a Stage 2 failure.

## Deferred to Stage 3

Stage 2 passes only two signed 32-bit integers through the existing Bridge encoding. It does not
yet define a versioned QFabric wire ABI, generated serializers, structured values, protocol
metadata, duplicate handling, or effect classes. Those are the explicit scope of Stage 3.
