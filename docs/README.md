# 📚 OreoOS docs

Everything in this folder is here for one of three audiences:

- **People who want to build the badge** → start with [`HARDWARE.md`](HARDWARE.md)
- **People who want to copy the design** → start with [`DATASHEET.md`](DATASHEET.md)
- **People who want to read the dev journal** → the per-subsystem `.md` files (lcd, buttons, breadboard BOM, badge layout)

If you're a contributor writing apps or hacking on the OS itself,
the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) is your starting
point — not this folder.

---

## 📑 What's in here

| File | What it covers | Audience |
|---|---|---|
| [`HARDWARE.md`](HARDWARE.md) | Narrative build guide — BOM, pinout, power, wake-from-sleep, soldering tips | Anyone building or repairing the badge |
| [`DATASHEET.md`](DATASHEET.md) | Formal specs — electrical, mechanical, communication interfaces, component reference | Someone designing a PCB or porting OreoOS |
| [`BADGE_LAYOUT.md`](BADGE_LAYOUT.md) | Mechanical layout drawings + dimensions | PCB designers, case-makers |
| [`BREADBOARD_BOM.md`](BREADBOARD_BOM.md) | First-time-builder BOM with through-hole-friendly parts | Workshop teachers, beginner solderers |
| [`lcd.md`](lcd.md) | Display init, RAMWR strategy, refresh fps notes | Anyone touching `oreoWare/display.py` |
| [`buttons.md`](buttons.md) | Matrix wiring, debounce, wake-on-press details | Anyone touching `oreoWare/buttons.py` |
| [`VIDEO_ARCHITECTURE.md`](VIDEO_ARCHITECTURE.md) | Technical deep dive: RV565 v4, PSRAM preload, native Xtensa scaling, 24 FPS scheduling | Anyone extending Gallery or embedded media playback |
| [`RV565_KNOWLEDGE_DECK.md`](RV565_KNOWLEDGE_DECK.md) | Slide-form explanation of RV565 v6, the firmware boundary, DMA pipeline, measurements, and roadmap | Engineers, research collaborators, and presenters |
| [`../paper/`](../paper/) | Academic RV565 paper source, TikZ architecture, references, and blank evaluation tables | Researchers and artifact reviewers |
| [`FIRMWARE.md`](FIRMWARE.md) (TODO) | How to flash MicroPython under the OS | Anyone bringing up a new board |
| [`images/`](images/) | Photos, screenshots, the banner, mockups | The README + sibling docs reference these |

---

## 🗺 Big-picture reading order

1. **[`../README.md`](../README.md)** — what the badge is, what it does
2. **[`HARDWARE.md`](HARDWARE.md)** — build it on a breadboard
3. **[`DATASHEET.md`](DATASHEET.md)** — every number you need to copy / extend it
4. **[`../CONTRIBUTING.md`](../CONTRIBUTING.md)** — write your first app, cut a release

---

## 🧪 Source of truth

When something disagrees:

- **Pin map** → [`../oreoWare/pins.py`](../oreoWare/pins.py)
- **OS version** → [`../oreoOS/config.py`](../oreoOS/config.py) (`VERSION` constant)
- **Theme colours** → [`../oreoOS/theme.py`](../oreoOS/theme.py)
- **OTA release manifest format** → [`../tools/build_release.py`](../tools/build_release.py)

This folder describes those files; it doesn't override them.

---

## 📨 Found a typo, a wrong pin, or a missing diagram?

Open an issue or PR — see [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
Docs improvements have the same warm welcome as code changes.

Or email **hello@elixpo.com**.
