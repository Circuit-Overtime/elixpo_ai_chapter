# Oreo badge hardware

This KiCad 10 project is the bare-chip successor to the ESP32-S3 DevKitC
breadboard. The root schematic, `elixpo.kicad_sch`, links four detailed sheets:

1. ESP32-S3R8 core, 16 MB external flash, 40 MHz clock and 2.4 GHz RF network.
2. USB-C data/power, BQ24074 Li-ion power-path charger and TPS63031 3.3 V rail.
3. TPS61023 5 V LCD supply, ST7789 module connector, buttons and corner LEDs.
4. MPU-6050, exact-capture IR path, WS2812 status LED, microSD and expansion.

Run `./circuit/elixpo/build.sh` from any directory to regenerate the design and
produce the ERC report, PDF and KiCad-native BOM under `circuit/elixpo/build/`.

`BOM_PROCUREMENT.csv` is the sourcing-oriented BOM. `BOM_PRELIMINARY.csv` is a
flat engineering export that is regenerated directly from the schematic model.

## Electrical decisions

- U1 is `ESP32-S3R8`: 8 MB octal PSRAM is inside the package. GPIO33–GPIO37
  are therefore unavailable and are explicitly marked as internal connections.
- U2 is an external 16 MB, 3.3 V quad-SPI flash matching the tested N16R8
  prototype capacity.
- Native USB uses GPIO19/GPIO20, 22 ohm series resistors, Type-C 5.1 kohm Rd
  resistors and a dedicated low-capacitance ESD array.
- BQ24074 keeps the system powered while charging. The current design targets
  about 500 mA charge current, about 775 mA input limit, about 50 mA termination
  current, and a 6.25-hour safety timer. These values must be checked against
  the selected cell before production.
- The main 3.3 V rail is buck-boost regulated so the badge remains stable over
  the full Li-ion discharge curve. The tested display module gets its own 5 V
  boost rail.
- microSD shares the LCD clock/MOSI lines and uses GPIO43 as CS and GPIO44 as
  MISO. Firmware must arbitrate the two devices and keep both chip-select lines
  inactive while the other device owns the bus.
- GPIO45 and GPIO46 are deliberately unused because they are boot strapping
  pins. GPIO0 has a dedicated BOOT switch and CHIP_PU has the recommended
  10 kohm/1 uF reset network.

## Before PCB layout

- Freeze the exact display module and battery connector orientation.
- Confirm the selected LiPo capacity, protection board, NTC curve and maximum
  permitted charge current.
- Review the ESP32-S3 RF layout against Espressif's current hardware guide;
  tune the antenna network on assembled boards with a VNA.
- Replace the MPU-6050 only if its successor driver is added to OreoOS first.
- Confirm every regulator inductor, capacitor DC-bias curve and thermal margin.
- Treat this as an engineering prototype, not a production-certified charger
  or RF design, until layout review, bring-up and compliance testing complete.
