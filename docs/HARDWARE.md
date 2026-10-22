# Oreo Badge — Hardware

<!-- TODO: pinout / breadboard / final PCB photos -->
<div align="center">
<img src="images/breadboard.png" alt="Breadboard prototype" width="640">
</div>

The reference design is built around an **ESP32-S3-DevKitC-1-N16R8**
(16 MB flash + 8 MB PSRAM). All electronics live on a 90×54 mm
single-layer PCB that fits a standard lanyard slot.

---

## Bill of materials

| Part | Qty | What it does | Notes |
|---|:-:|---|---|
| ESP32-S3-DevKitC-1-N16R8 | 1 | brain, WiFi 802.11 b/g/n, BLE 5.0 | 16 MB flash, 8 MB PSRAM |
| ST7789 IPS LCD, 2.0", 320×240 | 1 | display | 4-wire SPI, PWM backlight |
| 12×12 mm tactile switch | 8 | HOME, A, B, C, dpad | through-hole, click-feel |
| TTP223 capacitive touch module | 2 | _planned v2 — not wired in v1_ | front-panda + secondary pads |
| MPU-6050 (GY-521) | 1 | tilt input for games | I²C, 0x68 |
| TSOP38238 IR receiver | 1 | quest beacon detection | active-low data |
| IR LED (940 nm) + 2N2222 NPN | 1 each | IR transmitter | NEC protocol |
| AMS1117-3.3 (on DevKit) | 1 | 5V → 3V3 regulator | onboard |
| Polyfuse, USB-C ESD diodes | various | USB protection | onboard |
| 18650 cell + holder | 1 | battery | swap-friendly |
| MAX17048 fuel gauge | 1 | accurate % readout | I²C, optional |
| ~2000 µF bulk decoupling | 1 | smooths WiFi/BT current spikes | tantalum or electrolytic |

A through-hole-friendly variant of this BOM (designed so a first-time
solderer can finish in an evening) is in
[`docs/BREADBOARD_BOM.md`](BREADBOARD_BOM.md).

---

## Pinout

**Single source of truth: [`oreoWare/pins.py`](../oreoWare/pins.py).**
When the PCB swaps a pin, that file is the only one to edit. Drivers
import the constants by name, never the literal GPIO number.

Current assignments:

| Function | GPIO | Notes |
|---|:-:|---|
| Display CS | 14 | |
| Display RESET | 16 | |
| Display DC | 15 | |
| Display MOSI | 11 | display silkscreen: SDA |
| Display SCK | 12 | display silkscreen: SCL |
| Display BL (PWM backlight) | 17 | active-high; PWM-able |
| BTN_HOME / A / B / C | 9 / 10 / 13 / 8 | active-low, pull-up |
| BTN_UP / DOWN / LEFT / RIGHT | 4 / 5 / 6 / 7 | active-low, pull-up |
| LED corners (TL/TR/BL/BR) | 38 / 39 / 40 / 41 | LEDC PWM via 470 Ω |
| LED_STATUS (onboard NeoPixel) | 48 | WS2812 |
| IR_TX (→ 2N2222 base via 4.7 kΩ) | 2 | RMT carrier @ 38 kHz |
| IR_RX (TSOP38238 OUT) | 18 | active-low data |
| ADC_VBAT (100 k/100 k divider) | 1 | ADC1_CH0 |
| I²C SDA / SCL | 42 / 47 | 100 kHz default; shared bus |
| IMU_INT (MPU-6050 → wake) | 3 | RTC GPIO |
| TOUCH_OUT_1 (TTP223 #1) | 21 | RTC GPIO, active-high — primary pad, wake-capable; _reserved for v2_ |
| TOUCH_OUT_2 (TTP223 #2) | 33 | non-RTC, active-high — secondary pad, edge-poll only; _reserved for v2_ |

Display SPI runs at **40 MHz**, the practical ceiling for GPIO-matrix-
routed pins on the ESP32-S3 — going higher loses bits at the matrix.
Full-frame transfer is ~30.7 ms (153 600 bytes), which puts the
refresh ceiling around 33 fps. The framebuf is split into 4 quarters
during `present()` so the current draw is averaged across a longer
window — this eliminates the ~2 Hz backlight pulse you'd otherwise see
on a breadboard supply.

---

## Power

Two paths feed the 3V3 rail:

1. **USB-C** → polyfuse → AMS1117-3.3 LDO → 3V3 rail (normal day-to-day)
2. **18650** → MAX17048 (fuel gauge passthrough) → 3V3 rail (untethered)

A 2000 µF bulk capacitor across the 3V3 rail at the ESP32-S3's pin
absorbs WiFi/BT TX spikes. Without it the AMS1117's transient response
isn't fast enough — a WiFi association pulls ~300 mA in microseconds
and the rail collapses below the 2.7 V brownout threshold.

**WiFi power capping** lives in `oreoOS/config.py`:

```python
WIFI_TX_DBM       = 11        # ~140 mA peak (vs 240 mA at 19.5 dBm default)
WIFI_POWERSAVE    = True       # ~15 mA idle vs ~100 mA always-on
BT_ADV_INTERVAL_MS = 500       # ~5× lower BLE duty than the default
```

These settings ship in `secrets.py` at deploy time and are applied to
the radio after `wlan.active(True)`.

---

## Wake from sleep

The badge enters a soft-polled sleep when the OS idle timer elapses
(default 0 = disabled; configurable in **Settings → Sleep After**, 0–10
min). During sleep the LCD backlight is off and the CPU polls inputs at
~33 Hz. Wake sources, in priority order:

- Any of the 8 matrix buttons transitioning from idle → pressed
- A 24-hour safety ceiling (so a stuck pin can't strand the chip)

(v2 will add TTP223 capacitive pads as an additional wake source; v1
firmware is button-only.)

We polled rather than calling `machine.lightsleep()` + `Pin.irq(wake=)`
because the current MicroPython 1.28 build on the S3 silently ignored
the wake flag on some boots. Polling is guaranteed-correct and only
costs ~30 mA vs ~80 mA in the run loop.

---

## Soldering tips

- **Resistor pull-ups on the I²C lines.** Most GY-521 breakouts have
  them onboard; bare chips need 4.7 kΩ from each line to 3V3.
- **Decouple aggressively.** 100 nF + 10 µF near every IC pin pair
  (TSOP especially — it self-triggers on any rail droop).
- **3V3 vs 5V on the IR LED.** The TX circuit is rated for 3V3 — see
  the comments in `oreoWare/ir.py` for the resistor math if you want to
  swap to 5V for more range.
- **Don't reverse the electrolytic on the bulk cap.** The stripe (or
  the shorter leg) is GND.

---

## OTA update partition

OreoOS doesn't use ESP-IDF OTA partitions. Updates write into a
`/_ota/` directory on the LittleFS filesystem, validate SHA-256 per
file, and the boot path atomically copies them into their final
locations. The MicroPython firmware itself doesn't change at OTA time
— only the Python code on the filesystem does. This keeps the bricking
risk bounded: a power loss mid-download leaves the badge running the
previous version.

To update the underlying MicroPython firmware (rare), flash via
`esptool` over USB. The procedure is in
[docs/FIRMWARE.md](FIRMWARE.md) (TODO).

---

## Open questions

- Final case material (PLA print? cardboard cut-out? laser-etched
  acrylic?).
- Whether to integrate the IR TX onto the PCB or keep it as a daughter
  board.
- Whether the v2 PCB swaps the AMS1117 for an MCP1700 to drop quiescent
  current.

Suggestions welcome — open an issue or email **hello@elixpo.com**.
