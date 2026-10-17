# Oreo Badge — Datasheet

**Document version:** rev. A — 2026-05-15
**Hardware revision:** reference design (breadboard prototype)
**OS:** OreoOS v1.3 +

This document is the single technical reference for the Oreo Badge:
electrical, mechanical, and logical. It complements
[`HARDWARE.md`](HARDWARE.md) (which is the *narrative* build guide) and
[`../oreoWare/pins.py`](../oreoWare/pins.py) (which is the *executable*
pin map). When this document and the source code disagree, the source
code wins — please file an issue.

---

## 1 · Mechanical

| Parameter | Value | Notes |
|---|---|---|
| Outline (PCB) | 90 × 54 mm | standard lanyard slot |
| Outline (incl. battery holder) | 90 × 54 × 22 mm | 18650 cell raises depth |
| Mass (loaded, no case) | ≈ 65 g | with 18650 |
| Mounting | 4 × M2 corner holes + lanyard slot | hole pitch 84 × 48 mm |
| Display viewing area | 40.92 × 30.69 mm | 2.0" diagonal |
| Operating temperature | 0 °C … 50 °C | LCD limit; chip rated higher |
| Storage temperature | −20 °C … 60 °C | battery limit |

---

## 2 · Electrical

### 2.1 Supply

| Rail | Min | Typ | Max | Source |
|---|---|---|---|---|
| USB-C VBUS | 4.50 V | 5.00 V | 5.25 V | host port |
| Battery (Li-ion) | 3.30 V | 3.70 V | 4.20 V | 18650 cell |
| 3V3 logic rail | 3.20 V | 3.30 V | 3.35 V | AMS1117-3.3 LDO |

### 2.2 Current draw (typical, 25 °C)

| Mode | Current @ 3V3 | Notes |
|---|---|---|
| Active, display on, WiFi connected (idle) | 95 mA | LCD ~50 mA dominates |
| Active, WiFi TX (11 dBm cap) | 130 mA peak | spike duration <10 ms |
| Active, BLE advertise (500 ms interval) | 65 mA avg | radio off most of the time |
| Display off (soft sleep), WiFi off | 22 mA | matrix-button polling at 33 Hz |
| Deep sleep (ESP32 RTC only) | 25 µA | not currently used by the OS |
| Inrush at USB plug-in | ~250 mA for 30 ms | polyfuse must reset within 1 s |

Bulk capacitance on the 3V3 rail (2000 µF, electrolytic + ceramic
parallel) is **required** to absorb WiFi TX spikes when running off the
onboard AMS1117. Without it, the radio's microsecond-scale demand
collapses the rail below the 2.7 V brownout threshold.

### 2.3 Battery

| Parameter | Value |
|---|---|
| Chemistry | Li-ion, 18650 form factor |
| Cell capacity (typical) | 3000 mAh |
| Charge controller | TP4056 (1A, USB-C, with protection) |
| Fuel gauge | MAX17048 (I²C, addr 0x36) — optional |
| Battery-monitor divider | 100 kΩ / 100 kΩ → `ADC_VBAT` (GPIO 1) |
| Expected runtime | ~14 h active, ~3 weeks idle (BL off) |

---

## 3 · Microcontroller

| Parameter | Value |
|---|---|
| Part | Espressif ESP32-S3-WROOM-1-N16R8 |
| Module | ESP32-S3-DevKitC-1-N16R8 |
| Core | Dual-core Xtensa LX7 @ 240 MHz |
| Flash | 16 MB (Quad SPI) |
| PSRAM | 8 MB (Octal SPI) |
| Radio | WiFi 802.11 b/g/n + BLE 5.0 |
| USB | Native USB 1.1 OTG (data) + CP2102N (debug UART) |
| GPIOs available | 21 of 45 used (see § 6) |
| OS firmware | MicroPython 1.28 (ESP32_GENERIC_S3 + SPIRAM_OCT) |

---

## 4 · Display

| Parameter | Value |
|---|---|
| Controller | Sitronix ST7789 (P3 variant) |
| Panel type | IPS (in-plane switching), 16-bit colour |
| Resolution | 320 × 240, RGB565 |
| Diagonal | 2.0 inches |
| Interface | 4-wire SPI |
| SPI clock | 40 MHz (matrix-routed pin ceiling) |
| Frame size | 153 600 bytes (full RGB565 framebuffer) |
| Transfer time | ≈ 30.7 ms per full frame at 40 MHz |
| Theoretical fps | ≈ 33 fps |
| Backlight | PWM @ 1 kHz, 0–100 % software-controlled |
| Address window | set once on init, re-issued RAMWR per `present()` |

---

## 5 · Sensors + input

### 5.1 MPU-6050 (IMU)

| Parameter | Value |
|---|---|
| Interface | I²C @ 100 kHz / 400 kHz |
| Address | 0x68 (AD0 → GND) |
| Accelerometer range | ±2 g (configurable up to ±16 g) |
| Gyroscope range | ±250 °/s (configurable up to ±2000 °/s) |
| Sample rate | up to 1 kHz |
| INT pin | GPIO 3 (RTC GPIO, wakes deep sleep on motion) |
| Driver | [`oreoWare/imu.py`](../oreoWare/imu.py) |

### 5.2 TTP223 (capacitive touch pads) — _planned v2_

v2 hardware exposes **two independent** TTP223 pads so apps can wire
distinct touch surfaces (e.g. front-panda chest + back-cover secondary,
or a paired-badge handshake). v1 firmware does NOT read either; the
pins are reserved so v2 work doesn't re-pick GPIOs. Wake on v1 is
button-only.

| Parameter | Pad #1 | Pad #2 |
|---|---|---|
| Output | Active-HIGH momentary (jumper AHLB open, TOG open) | _same_ |
| Idle current | < 5 µA | < 5 µA |
| Active current | ~10 µA | ~10 µA |
| OUT line | GPIO 21 (RTC GPIO) | GPIO 33 (non-RTC) |
| Wake from deep sleep | Yes (`ext1` RTC wake) | No (poll-only) |
| Driver | _none in v1_ | _none in v1_ |

### 5.3 TSOP38238 (IR receiver)

| Parameter | Value |
|---|---|
| Carrier frequency | 38 kHz (centre) |
| Range | ~6 m line of sight |
| Output | Active-LOW data, open collector |
| Supply | 3V3 (uses 100 nF + 4.7 µF decoupling) |
| Data line | GPIO 18 |
| Decoded protocols | NEC (full), raw timing (fallback) |
| Driver | [`oreoWare/ir.py`](../oreoWare/ir.py) |

### 5.4 Tactile buttons

| Button | GPIO | Pull | Active |
|---|:-:|---|---|
| HOME | 9 | INT_PULL_UP | LOW |
| A | 10 | INT_PULL_UP | LOW |
| B | 13 | INT_PULL_UP | LOW |
| C | 8 | INT_PULL_UP | LOW |
| UP | 4 | INT_PULL_UP | LOW |
| DOWN | 5 | INT_PULL_UP | LOW |
| LEFT | 6 | INT_PULL_UP | LOW |
| RIGHT | 7 | INT_PULL_UP | LOW |

All buttons are RTC-capable GPIOs and serve as wake sources during soft
sleep.

---

## 6 · Pinout

Authoritative table — derived from [`oreoWare/pins.py`](../oreoWare/pins.py).

| GPIO | Function | Direction | Notes |
|:-:|---|:-:|---|
| 0 | (boot strapping) | — | leave floating / 10 kΩ pull-up |
| 1 | ADC_VBAT | AIN | ADC1_CH0 via 100k/100k divider |
| 2 | IR_TX | OUT | drives 2N2222 base via 4.7 kΩ |
| 3 | IMU_INT | IN | RTC GPIO; wake-on-motion |
| 4 | BTN_UP | IN, pull-up | RTC GPIO |
| 5 | BTN_DOWN | IN, pull-up | RTC GPIO |
| 6 | BTN_LEFT | IN, pull-up | RTC GPIO |
| 7 | BTN_RIGHT | IN, pull-up | RTC GPIO |
| 8 | BTN_C | IN, pull-up | RTC GPIO |
| 9 | BTN_HOME | IN, pull-up | RTC GPIO |
| 10 | BTN_A | IN, pull-up | RTC GPIO |
| 11 | DISPLAY_MOSI | OUT | SPI1, 40 MHz, label "SDA" on LCD module |
| 12 | DISPLAY_SCK | OUT | SPI1, 40 MHz, label "SCL" on LCD module |
| 13 | BTN_B | IN, pull-up | RTC GPIO |
| 14 | DISPLAY_CS | OUT | SPI chip-select, active LOW |
| 15 | DISPLAY_DC | OUT | data/command select |
| 16 | DISPLAY_RESET | OUT | active LOW reset |
| 17 | DISPLAY_BL | OUT, PWM | backlight, 1 kHz, 0–100 % |
| 18 | IR_RX | IN | TSOP38238 OUT line, active LOW |
| 19 | USB_DM | — | native USB; leave for the controller |
| 20 | USB_DP | — | native USB; leave for the controller |
| 21 | TOUCH_OUT_1 | IN | RTC GPIO; TTP223 #1 OUT, active HIGH — wake-capable; _reserved for v2, not read by v1 firmware_ |
| 33 | TOUCH_OUT_2 | IN | non-RTC; TTP223 #2 OUT, active HIGH — poll-only; _reserved for v2, not read by v1 firmware_ |
| 35–37 | (PSRAM) | — | reserved by the ESP32-S3-N16R8 PSRAM |
| 38 | LED_TL | OUT, PWM | corner LED via 470 Ω |
| 39 | LED_TR | OUT, PWM | corner LED via 470 Ω |
| 40 | LED_BL | OUT, PWM | corner LED via 470 Ω |
| 41 | LED_BR | OUT, PWM | corner LED via 470 Ω |
| 42 | I2C_SDA | I/O | I²C bus (MPU-6050, future expanders) |
| 47 | I2C_SCL | OUT | I²C bus (MPU-6050, future expanders) |
| 48 | LED_STATUS | OUT | onboard WS2812 NeoPixel |

All other GPIOs are either unused, strapping pins, or routed to PSRAM /
USB and should not be touched without rechecking the ESP32-S3 reference
manual.

---

## 7 · Component reference

| Reference | Part | Package | Datasheet |
|---|---|---|---|
| U1 | ESP32-S3-WROOM-1 | module, 18 × 25.5 mm | [Espressif](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) |
| U2 | AMS1117-3.3 | SOT-223 | [AMS](http://www.advanced-monolithic.com/pdf/ds1117.pdf) |
| U3 | CP2102N (on DevKit) | QFN-24 | [Silicon Labs](https://www.silabs.com/documents/public/data-sheets/cp2102n-datasheet.pdf) |
| U4 | TP4056 | SOP-8 | [NanJing Top Power](https://dlnmh9ip83nhy.cloudfront.net/datasheets/Prototyping/TP4056.pdf) |
| U5 | MAX17048 | DFN-8 | [Maxim](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX17048-MAX17049.pdf) |
| U6 | MPU-6050 (GY-521) | breakout, 21 × 16 mm | [InvenSense](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf) |
| U7 | TTP223 ×2 _(v2 only)_ | breakout, 11 × 16 mm | [Tontek](https://www.dianyuan.com/upload/community/2017/06/12/1497224944-37090.pdf) |
| U8 | TSOP38238 | three-leg, 6.95 × 5.0 mm | [Vishay](https://www.vishay.com/docs/82489/tsop382.pdf) |
| LCD1 | ST7789P3 module | 51 × 35 mm | [Sitronix](http://www.smt.eonas.cn/datasheet/ST7789P3.pdf) |
| D1 | 940 nm IR LED | 5 mm through-hole | generic |
| Q1 | 2N2222 NPN | TO-92 | [ON Semiconductor](https://www.onsemi.com/pdf/datasheet/p2n2222a-d.pdf) |
| SW1–8 | Tactile switch 12 × 12 mm | through-hole | generic |
| BAT1 | 18650 Li-ion cell | cylindrical, 18 × 65 mm | manufacturer-dependent |

---

## 8 · Communication interfaces

| Interface | Pins | Speed | Used by |
|---|---|---|---|
| SPI1 (LCD) | 11 (MOSI), 12 (SCK) + 14 (CS), 15 (DC), 16 (RST) | 40 MHz | `oreoWare.display` |
| I²C0 | 42 (SDA), 47 (SCL) | 100 kHz default | `oreoWare.imu`, MAX17048 |
| UART0 | (CP2102 onboard) | 115 200 bps | mpremote, console |
| USB-CDC | 19 (D-), 20 (D+) | USB FS 12 Mbps | mpremote, REPL |
| WiFi | internal | 802.11 b/g/n | `oreoWare.wifi`, OTA |
| BLE | internal | BLE 5.0 LE | `oreoWare.bt` |
| IR-NEC | 2 (TX), 18 (RX) | 38 kHz carrier | `oreoWare.ir` |

---

## 9 · Software stack

| Layer | Module(s) | Lines |
|---|---|---|
| Boot + launcher | `oreoOS/launcher.py`, `oreoOS/entry.py` | ~450 |
| App SDK | `oreoOS/app.py`, `oreoOS/api.py` | ~300 |
| Theme + widgets | `oreoOS/theme.py`, `oreoOS/widgets.py` | ~250 |
| Power manager | `oreoOS/power.py` | ~220 |
| OTA client | `oreoOS/ota.py` | ~350 |
| Cache (TTL) | `oreoOS/cache.py` | ~150 |
| Hardware drivers | `oreoWare/*.py` | ~1400 total |
| Apps | `apps/*/main.py` | ~6000 total across 13 apps |

The OS is intentionally small: under ~10 KLOC of Python total. Anyone
fluent in MicroPython can read it end-to-end in an afternoon.

---

## 10 · Document control

| Rev | Date | Author | Notes |
|---|---|---|---|
| A | 2026-05-15 | @Circuit-Overtime | initial datasheet, breadboard reference design |

Errata + corrections → `hello@elixpo.com` or open an issue.
