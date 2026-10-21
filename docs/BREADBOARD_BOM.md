# Oreo Badge — Breadboard Phase BOM

Goal: validate the full feature set (display, touch, buttons, IR TX/RX, corner LEDs, battery monitor stub) on solderless breadboard before committing to PCB.

**Scope:** breadboard prototype only. USB power comes from the ESP32-S3 DevKit's USB-C — no charger, no buck regulator, no LiPo on this phase. Those move to PCB.

**Total estimated cost:** ~$45–55 USD if you have nothing, ~$20 if you already own a tinkerer's kit.

---

## 1. Compute

| # | Part | Qty | Notes |
|---|---|---:|---|
| 1.1 | [ESP32-S3-DevKitC-1-N16R8 (OceanLabz)](https://www.amazon.in/OceanLabz-ESP32-S3-DevKit-N16R8-MicroPython-Unsoldered/dp/B0F9XB91XG) | 1 | **N16R8 variant only** — 16MB flash + 8MB octal PSRAM, dual USB-C (UART + native OTG), PCB antenna, headers unsoldered. Datasheets: [ESP32-S3 chip](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf) · [WROOM-1 module](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) · [DevKitC-1 pinout (RNT)](https://randomnerdtutorials.com/esp32-s3-devkitc-pinout-guide/) |
| 1.2 | USB-C to USB-A (or USB-C) cable, data-capable | 1 | Some cables are charge-only. Confirm data lines work — needed for flashing + USB-MSC. |

### 1.a Dual USB-C port reference

The DevKitC-1 has **two** USB-C ports — they are not interchangeable:

| Silkscreen | Internal path | Linux device | Use for |
|---|---|---|---|
| **UART** | USB → CP2102 bridge → UART0 (GPIO43 TX / GPIO44 RX) | `/dev/ttyUSB0` | Flashing + `Serial.print` during bring-up. Auto-reset is bulletproof. |
| **USB** | USB → ESP32-S3 native USB-OTG peripheral (GPIO19/20) | `/dev/ttyACM0` | USB-CDC, USB-MSC (mount as drive), USB-HID (keyboard mode), DFU. |

**Default during development:** flash via the **UART** port. Reserve the **USB** port for the badge's user-facing USB features so a firmware crash on the CDC stack doesn't take your debug serial down with it.

**What is UART vs USB?** UART is a 2-wire async serial protocol (TX/RX, agreed baud rate, 3.3V TTL) implemented as a peripheral inside the chip. USB is a complex packet-based bus with enumeration and device classes; the S3 has a native USB peripheral so it can speak it directly. The UART port relies on a CP2102 bridge chip that converts USB↔UART for the PC.

---

## 2. Display

| # | Part | Qty | Notes |
|---|---|---:|---|
| 2.1 | [**SmartElex 2.0" IPS TFT LCD (LHS200KP-IF05)**](https://robu.in/product/smartelex-2-inch-ips-tft-lcd-module) — ST7789P3, 240×320, 4-wire SPI, no touch | 1 | Same controller family as the Tufty. Sharper than 2.4" (denser pixels), slimmer form factor, simpler wiring (no shared touch bus). Backlight: 3× white LEDs onboard, single PWM pin. **Power: VCC to DevKit 5V** (onboard AMS1117 LDO drops to 3.3V for the panel) — see [docs/lcd.md](docs/lcd.md) for the full pin map. [Module datasheet (Robu)](https://robu-prod-media.s3.ap-south-1.amazonaws.com/uploads/2026/03/SmartElex-2-inch-IPS-TFT-LCD-module.pdf) |
| 2.2 | Female-to-male Dupont jumpers, 20cm | 1 bundle (10pc) | Connecting display module to breadboard. |

**Display pinout reference (SmartElex 2.0" ST7789P3 — module silkscreen names):**

```
VCC  GND  EN   DC   SCL  SDA  CS   RST  TE
5V   GND  G17  G15  G12  G11  G14  G16  —
```

7 wires from the display connected, 2 skipped (TE = optional vsync, MISO = panel is write-only). Authoritative reference: [docs/lcd.md](docs/lcd.md).

**GPIO freed by dropping touch:** GPIO18 and GPIO21 are now unassigned — reserved for future expansion or exposed on the dev breakout header for hackability.

---

## 3. Input — Buttons

| # | Part | Qty | Notes |
|---|---|---:|---|
| 3.1 | 6mm tactile push buttons, 4-pin through-hole | 8 | HOME, A, B, C, UP, DOWN, LEFT, RIGHT. Standard 6×6×5mm body, fits breadboard cleanly. Buy 10–20, they fail/lose easily. |
| 3.2 | (Optional) 10kΩ external pull-up resistors | 8 | ESP32-S3 has internal pull-ups — these are **only** needed if internal pull-ups misbehave. Leave out initially. |

Wiring: each button connects GPIO ↔ GND, with internal pull-up enabled in software. Pressed = LOW.

---

## 4. IR Subsystem

### 4.1 IR Receiver

| # | Part | Qty | Notes |
|---|---|---:|---|
| 4.1.1 | TSOP38238 (or TSOP4838) | 1 | 38 kHz demodulating IR receiver. 3-pin: OUT, GND, VS. Output idles HIGH, pulses LOW on burst — directly readable on a GPIO. |
| 4.1.2 | 100µF electrolytic cap | 1 | Across VS–GND of the TSOP, datasheet-recommended decoupling to suppress supply noise that causes false detections. **This is the small part everyone forgets.** |
| 4.1.3 | 100Ω resistor | 1 | Series on TSOP VS pin (datasheet RC filter with the 100µF). |

### 4.2 IR Transmitter

| # | Part | Qty | Notes |
|---|---|---:|---|
| 4.2.1 | TSAL6400 IR LED, 940nm | 2 | Buy spares — they're the same body as visible LEDs and easy to mix up. |
| 4.2.2 | 2N2222 NPN transistor (TO-92) | 1 | Or 2N3904 / BC547 — any small-signal NPN. |
| 4.2.3 | 100Ω ¼W resistor | 1 | IR LED current limit (~30mA peak through 2N2222 from 3V3). |
| 4.2.4 | 4.7kΩ ¼W resistor | 1 | Base resistor for 2N2222 from GPIO48. |

Wiring: GPIO48 → 4.7k → base; emitter → GND; collector → IR LED cathode; LED anode → 100Ω → 3V3.

---

## 5. Corner Backlight LEDs

| # | Part | Qty | Notes |
|---|---|---:|---|
| 5.1 | 5mm white LEDs | 4 | Through-hole for breadboard. Replace with 0603 SMD on PCB. |
| 5.2 | 470Ω ¼W resistors | 4 | One per LED, sized for ~5mA from 3V3 PWM. |

Driven by GPIO38–41 via LEDC PWM. One resistor + LED per GPIO, cathode → GND.

---

## 6. Battery Monitor Stub (test-only on breadboard)

| # | Part | Qty | Notes |
|---|---|---:|---|
| 6.1 | 100kΩ 1% resistors | 2 | Voltage divider — simulates VBAT input. |
| 6.2 | 100nF ceramic cap | 1 | ADC filter. |
| 6.3 | 10kΩ trimmer pot (optional) | 1 | Lets you sweep "fake VBAT" 0–3.3V into ADC1_CH0 to test the battery indicator code without a real LiPo. |

---

## 7. Breadboard, Wires, Power Distribution

| # | Part | Qty | Notes |
|---|---|---:|---|
| 7.1 | Full-size 830-tie breadboard | 1 | A half-size will not fit DevKit + display + 8 buttons + IR + 4 LEDs. Get the full one. |
| 7.2 | (Optional) Second half-size breadboard | 1 | Useful for offloading IR + LEDs to a side rail. |
| 7.3 | Male-to-male jumper wire kit, assorted lengths | 1 kit (~140pc) | The cheap rainbow ribbon kit. |
| 7.4 | Male-to-female jumper wires, 20cm | 20 | For connecting display module pins. |
| 7.5 | Female-to-female jumper wires | 10 | Backup for awkward connections. |
| 7.6 | Solid-core 22AWG hookup wire, 3 colors (red/black/yellow) | 1m each | For clean power rails — ribbon jumpers come loose. |

---

## 8. Tools (assumed, but listing so nothing surprises you)

| # | Part | Qty | Notes |
|---|---|---:|---|
| 8.1 | Multimeter (continuity + voltage) | 1 | **Mandatory** — confirm 3V3 rail, check button continuity, hunt down shorts before powering up. |
| 8.2 | Wire strippers / flush cutters | 1 each | For 22AWG hookup wire. |
| 8.3 | Soldering iron + solder | 1 set | For attaching headers to the display module if it ships unpopulated. |
| 8.4 | (Optional) Cheap USB logic analyzer (Saleae clone, 8ch) | 1 | Invaluable for debugging SPI to the display and the NEC IR protocol. ~$10. Skip if you've used SPI before. |
| 8.5 | (Optional) IR remote with NEC protocol | 1 | Any old TV remote — for testing IR RX without first writing a TX. |

---

## 9. Resistor / Capacitor Quick Tally

For ordering — easy to miss when scattered across sections:

| Value | Qty | Use |
|---|---:|---|
| 100Ω ¼W | 2 | TSOP filter (4.1.3), IR LED current limit (4.2.3) |
| 470Ω ¼W | 4 | Corner LED current limit (5.2) |
| 4.7kΩ ¼W | 1 | IR TX base resistor (4.2.4) |
| 10kΩ ¼W | 8 (optional) | Button pull-ups (3.2) — only if internal pull-ups fail |
| 100kΩ 1% | 2 | VBAT divider stub (6.1) |
| 100nF ceramic | 1 | ADC filter (6.2) |
| 100µF electrolytic | 1 | TSOP supply decoupling (4.1.2) |
| 10kΩ trimmer pot | 1 (optional) | Fake VBAT sweep (6.3) |

A standard E12 resistor kit (600pc, ¼W) covers everything in this list and costs ~$8.

---

## 10. Deliberately Excluded from Breadboard Phase

Save these for the PCB so we don't waste time wiring tiny SMD parts into protoboard:

- MCP73831 LiPo charger (SOT-23-5)
- TPS62840 buck regulator (DLC package — 1.6×1.6mm)
- DMP2305U PMOS load-share
- USB-C receptacle, 5.1k CC pull-downs, ESD diode, polyfuse
- Battery + JST-PH connector
- Slide power switch

The DevKit's onboard 3V3 LDO + USB-C is enough to validate every other subsystem. Power architecture only matters when we're trying to hit the runtime target — and that's a PCB-phase number.

---

## 11. Pre-Flight Checklist Before Powering On

- [ ] All 8 buttons one-leg-to-GND, other-leg-to-GPIO (verify with multimeter continuity)
- [ ] Display VCC to **3V3, NOT 5V** (some modules are 5V-tolerant, ours is 3V3 native — don't gamble)
- [ ] Display GND tied to DevKit GND (common ground is the #1 cause of "screen is black")
- [ ] IR LED orientation correct (long lead = anode = toward 3V3 side)
- [ ] TSOP38238 orientation correct (check datasheet — pin 1 is OUT, easy to flip)
- [ ] Corner LED polarity correct
- [ ] No 3V3↔GND shorts (multimeter resistance check before plugging in USB)
- [ ] DevKit BOOT/EN buttons accessible (don't bury the DevKit under wires)

---

## 12. Order Plan

Single AliExpress order covers most of this for ~$25 shipped. Adafruit/Mouser if you want it tomorrow at 3× the price.

**Parts that benefit from a name brand:**
- ESP32-S3-DevKitC-1-N16R8 — buy from Espressif official store or DigiKey to guarantee N16R8 variant
- TSOP38238 — Vishay genuine, the AliExpress "TSOP1738" knockoffs work but vary in sensitivity

Everything else: generic is fine.

---

## 13. Reference Links

- **ESP32-S3-DevKitC-1 pinout guide:** https://randomnerdtutorials.com/esp32-s3-devkitc-pinout-guide/
- **ESP32-S3 datasheet (Espressif):** https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf
- **ESP32-S3-WROOM-1 module datasheet:** https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf
- **ILI9341 controller datasheet:** https://cdn-shop.adafruit.com/datasheets/ILI9341.pdf
- **XPT2046 touch controller datasheet:** https://www.buydisplay.com/download/ic/XPT2046.pdf
- **TSOP38238 datasheet (Vishay):** https://www.vishay.com/docs/82491/tsop382.pdf
- **GH Universe 25 badge repo:** [gh_badge/](gh_badge/)
- **`badgeware` API reference:** [gh_badge/badgerware/](gh_badge/badgerware/)
- **NEC IR protocol (matches Tufty):** [gh_badge/ir-beacon/common.py](gh_badge/ir-beacon/common.py)
