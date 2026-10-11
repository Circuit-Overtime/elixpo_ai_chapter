# Command-line reference

The `eeprom28c64` tool accepts Intel HEX and raw binary files. Intel HEX
checksums, overlapping records, address limits, and the EOF record are checked
before the serial port is opened.

The CLI is intentionally limited to an 8192-byte 28C64. It cannot electrically
identify the chip in the socket; verify that a compatible 5 V 28C64 is fitted
before running `program`.

## Commands

```text
eeprom28c64 ports
eeprom28c64 info IMAGE [--fill FF]
eeprom28c64 program IMAGE [-p PORT] [--fill FF]
eeprom28c64 verify IMAGE [-p PORT] [--fill FF]
eeprom28c64 dump OUTPUT [-p PORT]
```

`dump` writes Intel HEX when the output name ends in `.hex`, `.ihx`, or
`.ihex`; every other extension produces a raw 8192-byte binary.

## Programming workflow

1. Parse and validate the selected file.
2. Reject data outside `0000`-`1FFF`.
3. Fill unspecified addresses with the selected fill byte.
4. Display the input range, byte count, and expected CRC.
5. Send 32-byte records to firmware v10 with a progress bar.
6. Let the firmware verify every byte immediately after writing it.
7. Read the complete EEPROM back with a second progress bar.
8. Compare all 8192 bytes and CRC-16/CCITT-FALSE.

Programming exits with a nonzero status on malformed input, serial errors,
write failures, timeouts, byte mismatches, or CRC mismatches.

## Standalone executable

Build a single Linux executable:

```bash
./tools/build_cli.sh
```

The result is `dist/eeprom28c64`. It needs no Python installation:

```bash
./dist/eeprom28c64 program program.hex -p /dev/ttyUSB0
```
