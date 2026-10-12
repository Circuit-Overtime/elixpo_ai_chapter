---
name: nano28c64-programming
description: Prepare, inspect, program, dump, or verify binary and Intel HEX images safely with the Nano28C64 Arduino programmer. Use for Nano28C64 image sizing, fill behavior, serial programming, or EEPROM verification; do not apply to other EEPROM families or generic Arduino programmers.
---

# Nano28C64 programming

Use the repository's `eeprom28c64` host tool for all image parsing and bulk
transfers. Do not stream arbitrary bytes to the serial port or invent another
wire protocol.

## Hard limits

- The only supported target is a compatible **5 V 28C64**, tested with the
  AT28C64B-15PC.
- Capacity is exactly `0x2000` = **8192 bytes**.
- Valid addresses are `0x0000` through `0x1FFF`, inclusive.
- A raw binary may contain at most 8192 bytes. Reject an oversized file; never
  truncate it, wrap addresses, split it across writes, or silently discard data.
- A shorter binary is expanded to 8192 bytes. The default unused-byte value is
  `0xFF`; use another fill byte only when the user or target design requires it.
- Intel HEX may be sparse, but every data byte must resolve inside
  `0x0000`-`0x1FFF`. Checksums, EOF, overlaps, and address bounds must pass.

The Nano has too little SRAM to hold the full chip image. Construct the 8192-byte
image on the host and let the existing CLI send checked 32-byte Intel HEX
records to firmware v10.

## Safe workflow

1. Keep any Arduino serial monitor closed so it does not own the port.
2. Validate without touching the EEPROM:

   ```bash
   uv run eeprom28c64 info IMAGE
   ```

   Review the reported source format, input byte count, used address range,
   fill behavior, and expected CRC-16.
3. Locate the programmer when necessary:

   ```bash
   uv run eeprom28c64 ports
   ```

4. Programming overwrites all 8192 addresses, including filled space. Run it
   only when the user's request authorizes changing the EEPROM:

   ```bash
   uv run eeprom28c64 program IMAGE --port /dev/ttyUSB0
   ```

   Do not treat a progress bar alone as success. Require the command to finish
   with a full 8192-byte read-back match and matching CRC-16.
5. For non-writing operations, use `verify` to compare against an image or
   `dump` to make a complete 8192-byte backup:

   ```bash
   uv run eeprom28c64 verify IMAGE --port /dev/ttyUSB0
   uv run eeprom28c64 dump backup.bin --port /dev/ttyUSB0
   ```

Stop on any parser, serial, firmware-version, write, byte-compare, or CRC error.
Do not automatically retry a failed write or claim partial programming as a
usable result.

## Creating an exact-size binary

Prefer passing the source file directly to `eeprom28c64`, which already applies
these checks. When an exact 8192-byte `.bin` artifact is explicitly needed, the
equivalent host-side Python pattern is:

```python
from pathlib import Path

EEPROM_SIZE = 0x2000
FILL = 0xFF

payload = Path("input.bin").read_bytes()
if len(payload) > EEPROM_SIZE:
    raise ValueError(f"image is {len(payload)} bytes; maximum is {EEPROM_SIZE}")

image = bytearray([FILL]) * EEPROM_SIZE
image[:len(payload)] = payload
assert len(image) == EEPROM_SIZE
Path("image-8k.bin").write_bytes(image)
```

Run `uv run eeprom28c64 info image-8k.bin` afterward. This snippet prepares a
file only; the repository CLI remains responsible for communicating with the
Arduino and verifying the EEPROM.

For implementation details, consult `docs/CLI.md`,
`src/eeprom28c64/image.py`, and `src/eeprom28c64/protocol.py` in this repository.
