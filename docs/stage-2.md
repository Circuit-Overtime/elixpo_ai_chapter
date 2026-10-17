# Stage 2: one logical QTask on Linux and the RT MCU

Stage 2 proves explicit dual-domain execution. It does not implement profiling, contracts,
recommendations, or automatic placement.

## Architecture

The single logical declaration is `qtasks/add.qtask.h`:

```cpp
Q_TASK(add, int32_t, (int32_t a, int32_t b)) {
  return a + b;
}
```

Two thin target wrappers include that exact declaration:

- the Linux wrapper becomes a genuine 64-bit ARM AArch64 ELF executable;
- the RT wrapper becomes a Zephyr firmware artifact for the STM32U585 Cortex-M33 and registers
  `qf_qtask_add` with Arduino RouterBridge.

The Python CLI validates the task name, argument count, signed 32-bit input range, and result range
before selecting a domain. Consequently both domains expose the same result and validation errors.
The STM32 remains a separate RT execution domain reached through Bridge/RPC; it is never presented
as a Linux CPU.

## Workstation toolchains

Install the ARM64 cross-compiler if it is absent:

```bash
sudo apt update
sudo apt install g++-aarch64-linux-gnu
aarch64-linux-gnu-g++ --version
```

The pinned Arduino Zephyr core and RouterBridge libraries from Stage 1 remain the RT toolchain.
Verify them with:

```bash
arduino-cli version
arduino-cli core list
```

Install the updated local CLI and build both artifacts:

```bash
python -m pip install -e .
qf build
```

`qf build` writes `build/stage2/build-report.json` even when a target fails. A successful build
requires both `build/stage2/linux/qf-add-linux` to be an AArch64 ELF and exactly one
`*.elf-zsk.bin` Cortex-M33 upload artifact under `build/stage2/rt`. Compiler diagnostics are kept
separate by target so unsupported code identifies the failing domain.

## Deploy

Upload the RT artifact from the workstation:

```bash
arduino-cli upload \
  --fqbn arduino:zephyr:unoq \
  --port /dev/ttyACM0 \
  --input-dir build/stage2/rt
```

Copy the ARM64 artifact to the UNO Q without copying the ignored build tree wholesale:

```bash
ssh qfabric-unoq 'mkdir -p ~/QFabric/build/stage2/linux'
scp build/stage2/linux/qf-add-linux \
  qfabric-unoq:~/QFabric/build/stage2/linux/qf-add-linux
```

On the UNO Q, update and install the CLI:

```bash
git pull --ff-only
python -m pip install -e .
chmod 755 build/stage2/linux/qf-add-linux
```

## Explicit execution

Run the same logical task through the same CLI surface:

```bash
qf run add --domain linux -- 2 3
qf run add --domain rt -- 2 3
```

Both commands must print `5`. Domain selection is intentionally explicit in Stage 2.

Run the non-interactive acceptance smoke test on the UNO Q:

```bash
bash scripts/run-stage2-smoke.sh
```

The script verifies identical correct results and identical argument-count error reporting for
both domain selections.

The Stage 2 firmware replaces the Stage 1 probe firmware. Consequently, `qf-stage1 check` is not
a valid health check after this upload: the intentionally removed `qf_stage1_echo` method will be
reported as unavailable.

## Completion audit

Copy the successful workstation build report to the UNO Q:

```bash
scp build/stage2/build-report.json \
  qfabric-unoq:~/QFabric/build/stage2/build-report.json
```

Then update the checkout and run the audit on the UNO Q:

```bash
git pull --ff-only
python -m pip install -e .
qf audit --output data/processed/stage2-audit.json
```

The audit checks the dual-target build record, QTask source, ARM64 ELF architecture, live result
parity, and identical invalid-invocation behavior. A completed Stage 2 audit reports `pass`.

## Evidence

Retain the following for issue #3:

- `build/stage2/build-report.json` and the complete `qf build` transcript;
- the two explicit `qf run` commands and results;
- the non-interactive smoke-test result; and
- `data/processed/stage2-audit.json`; and
- this architecture note.

The completed result and accepted boundary are summarized in
[the Stage 2 findings](stage-2-findings.md).
