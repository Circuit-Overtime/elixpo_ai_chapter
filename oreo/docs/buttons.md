# Buttons — 8× tactile, active-low, internal pull-up

Canonical reference for the Lix badge's input. If anything here disagrees with
`BREADBOARD_BOM.md` or memory, **this file wins**.

## Mapping (button ↔ ESP32-S3 GPIO)

| Badge button | GPIO | Row on badge | Constant in `oreoOS.api` | Constant in `oreoWare.pins` |
|---|---:|---|---|---|
| UP    | 4  | direction | `api.BTN_UP`    | `pins.BTN_UP`    |
| DOWN  | 5  | direction | `api.BTN_DOWN`  | `pins.BTN_DOWN`  |
| LEFT  | 6  | direction | `api.BTN_LEFT`  | `pins.BTN_LEFT`  |
| RIGHT | 7  | direction | `api.BTN_RIGHT` | `pins.BTN_RIGHT` |
| C     | 8  | action    | `api.BTN_C`     | `pins.BTN_C`     |
| HOME  | 9  | action    | `api.BTN_HOME`  | `pins.BTN_HOME`  |
| A     | 10 | action    | `api.BTN_A`     | `pins.BTN_A`     |
| B     | 13 | action    | `api.BTN_B`     | `pins.BTN_B`     |

## Wiring per button — 2 wires

```
   [tactile switch]
    │           │
    │           │
   GND        GPIOn
   rail
```

- One leg → common GND rail
- Diagonally-opposite-side leg → its assigned ESP32-S3 GPIO
- **No external pull-up resistor** — the internal ~45kΩ pull-up is enabled in
  software by `Pin(n, Pin.IN, Pin.PULL_UP)` in `oreoWare/buttons.py`.

Active-low: idle reads `1` (pulled to 3V3 internally), pressed reads `0`
(shorted to GND through the switch).

The firmware applies an **8 ms software debounce window** to accepted press
and release edges. GPIO interrupts latch short taps while the display is busy;
the OS consumes the latched edge on its next update without producing duplicate
presses from switch bounce.

## Why these pins specifically

- **D-pad on GPIO 4-5-6-7**: four contiguous pins → cleanest possible parallel wire run on the breadboard. Spatial GPIO order roughly mirrors UP/DOWN/LEFT/RIGHT.
- **Action cluster on 8, 9, 10, 13**: the next densest free block. GPIO 11 and 12 are in the middle of this range but are claimed by the display SPI (SCK=12, MOSI=11), so we skip over them.
- **HOME on GPIO 9**: smack in the middle of the cluster. Easy thumb-reach on the badge, and it's the pin we verified first.
- **Nothing on GPIO 0, 3, 45, 46**: those are boot-strap pins — wrong level at reset bricks the boot sequence.
- **Nothing on GPIO 33-37**: those don't exist on the N16R8 module's header (used internally by the octal PSRAM).

## Pre-flight checklist

- [ ] All 8 buttons share the breadboard's GND rail
- [ ] Multimeter continuity, button-by-button: GPIOn ↔ GND should read OPEN when up, SHORT when pressed
- [ ] No two buttons connected to the same GPIO
- [ ] Buttons placed in two rows matching the badge layout (direction row above action row) so muscle memory survives the PCB transition

## Software access

Apps don't talk to GPIOs — they use the oreoOS API:

```python
from oreoOS import api
from oreoWare.buttons import Buttons

btns = Buttons()

# Each frame:
btns.update()                          # refresh edge state
if btns.just_pressed(api.BTN_HOME):    # rising-edge press
    ...
if btns.is_pressed(api.BTN_A):         # held state
    ...
```

The OS loop calls `btns.update()` once per frame, so apps that receive a
`Buttons` instance from the OS object just call `is_pressed` / `just_pressed` /
`just_released` and trust the state is fresh.

## Common failure modes

| Symptom | Likely cause |
|---|---|
| One button reads "stuck pressed" | Signal wire shorted to GND somewhere else on the rail, not via the switch |
| One button never registers | Wire on wrong GPIO, or wired to the same-side leg pair (no circuit) |
| Multiple buttons fire when one is pressed | Adjacent rows shorted on the breadboard — clean up dangling wires |
| Chatter (rapid press/release flips) | Cheap switches with bouncy contacts; bump the debounce in `Buttons` from one-frame to a few-frame hold |
| Wrong button label fires | Wire crossed between GPIOs; trace from button leg to header pin to verify |
