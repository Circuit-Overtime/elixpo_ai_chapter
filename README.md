# 28C64 EEPROM Programmer

A small programmer for the AT28C64B EEPROM, built with an Arduino Nano and two
74HC595 shift registers.

You select a `.hex` or `.bin` file; the command-line tool checks it, programs
the complete 8 KiB chip, shows progress, reads the chip back, and confirms that
every byte and the CRC match.

## What you need

- Arduino Nano (ATmega328P)
- AT28C64B EEPROM
- two 74HC595 shift registers
- one LED and a 330 ohm to 1 kilohm resistor
- three 10 kilohm pull-up resistors
- three 100 nF ceramic capacitors
- a regulated 5 V supply, breadboard, and jumpers

The complete wiring is in [the hardware guide](hardware/README.md). Do not use
an older wiring diagram that grounds `/CE`; the current design controls `/CE`
from Nano A3 so reset cannot accidentally write to the EEPROM.

## First-time setup

Install the Arduino AVR core and upload the firmware:

```bash
arduino-cli core install arduino:avr
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old firmware/28c64_programmer/28c64_programmer.ino
arduino-cli upload -p /dev/ttyUSB0 --fqbn arduino:avr:nano:cpu=atmega328old firmware/28c64_programmer/28c64_programmer.ino
```

These commands use the old Nano bootloader that matches this programmer's
Arduino. If you later use a Nano with the new bootloader, change
`atmega328old` to `atmega328`.

To open the manual serial console after uploading:

```bash
arduino-cli monitor -p /dev/ttyUSB0 --config baudrate=115200
```

Press `Ctrl+C` to leave the monitor before uploading again or using the
desktop programming tool.

Install the host tool with [uv](https://docs.astral.sh/uv/):

```bash
uv sync
```

Or build a single Linux executable that needs no Python environment:

```bash
./tools/build_cli.sh
./dist/eeprom28c64 --help
```

## Everyday use

Find the programmer:

```bash
uv run eeprom28c64 ports
```

Check a file without touching the EEPROM:

```bash
uv run eeprom28c64 info program.hex
```

Program and verify it:

```bash
uv run eeprom28c64 program program.hex --port /dev/ttyUSB0
```

Back up a chip:

```bash
uv run eeprom28c64 dump backup.bin --port /dev/ttyUSB0
```

Check a chip without rewriting it:

```bash
uv run eeprom28c64 verify program.hex --port /dev/ttyUSB0
```

The port option can be omitted when only one serial device is connected.

Unused addresses are filled with `FF` by default, giving every input file a
complete and repeatable 8 KiB image. Use `--fill 00` if your project expects
zero-filled unused space.

## LED signals

| Pattern | Meaning |
|---|---|
| Two short flashes | Ready |
| One long flash | Waiting for a HEX transfer |
| Steady light | Writing a byte |
| Three flashes | Success |
| Five rapid flashes | Error |

## Project layout

```text
firmware/   Arduino firmware
src/        desktop command-line tool
tests/      image and checksum tests
hardware/   KiCad schematic and breadboard notes
tools/      release build scripts
```

See [CLI details](docs/CLI.md) for every command and [firmware details](docs/FIRMWARE.md)
for the serial protocol and diagnostic commands.
