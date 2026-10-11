# Hardware wiring

All devices use the same regulated +5 V and ground. Place one 100 nF ceramic
capacitor directly between VCC and GND at the Nano-side power entry, each
74HC595, and the EEPROM.

## Arduino Nano

| Nano | Connection |
|---|---|
| D2 | SER pin 14 of the A0-A7 74HC595 |
| D3 | SRCLK pin 11 of both 74HC595s |
| D4 | RCLK pin 12 of both 74HC595s |
| D5-D12 | EEPROM I/O0-I/O7 in order |
| D13 | EEPROM `/WE` pin 27 |
| A0 | EEPROM `/OE` pin 22 |
| A6 | Status LED through 330 ohm-1 kilohm to GND |
| A3 | EEPROM `/CE` pin 20 |

## Address registers

The 74HC595 nearest the Nano drives EEPROM A0-A7. Its QH' pin 9 connects to
SER pin 14 of the second 74HC595, which drives A8-A12.

On both registers:

- pin 16 to +5 V;
- pin 8 to GND;
- `/SRCLR` pin 10 to +5 V;
- `/OE` pin 13 to GND;
- SRCLK pin 11 to Nano D3;
- RCLK pin 12 to Nano D4.

Low-address register outputs QA-QH connect to EEPROM A0-A7. High-address
register outputs QA-QE connect to EEPROM A8-A12. Its QF-QH and QH' are unused.

## EEPROM controls

Each control line connects directly to its Nano pin and separately through a
10 kilohm pull-up to +5 V:

```text
+5 V -- 10k --+-- EEPROM /WE pin 27
              +-- Nano D13

+5 V -- 10k --+-- EEPROM /OE pin 22
              +-- Nano A0

+5 V -- 10k --+-- EEPROM /CE pin 20
              +-- Nano A3
```

Do not ground `/CE`. Its pull-up keeps the EEPROM disabled while the Nano
bootloader toggles D13 during reset; firmware drives `/CE` low only after the
other signals are safe.

See `28c64_programmer.kicad_sch` for the editable schematic and
`28c64_programmer.pdf` for a printable copy. The schematic uses visible,
point-to-point wires rather than relying on matching net labels; junction dots
mark every intentional branch. Its generated ERC report contains no errors or
warnings.
