# Lix Badge — Physical Layout (canonical)

Portrait orientation. Worn from a lanyard hooked through the top edge.
Reference frame: looking at the **front** of the badge as the wearer sees it
(i.e. from behind), `up` = away from the lanyard.

Dimensions are rough targets for PCB phase; breadboard prototype just needs
the *clustering* to match so muscle memory carries over.

```
              top edge (lanyard hole)
+--------------------------------------+
|  O      IR-TX    IR-RX           O   |   <- corner LEDs + IR pair
|                                      |      (IR points forward, away
|  +--------------------------------+  |       from wearer's chest)
|  |                                |  |
|  |                                |  |
|  |                                |  |
|  |                                |  |
|  |          SCREEN                |  |
|  |          2.0" IPS              |  |
|  |          240 x 320             |  |
|  |          ST7789P3              |  |
|  |                                |  |
|  |                                |  |
|  |                                |  |
|  |                                |  |
|  +--------------------------------+  |
|                                      |
|  [ UP ]  [ DN ]  [ LT ]  [ RT ]      |   <- direction row
|                                      |
|  [HOME]  [ A  ]  [ B  ]  [ C  ]      |   <- action row
|                                      |
|  O                              O    |   <- corner LEDs
|              [USB-C]                 |
+--------------------------------------+
              bottom edge
```

## Component placements

| Component | Location | Notes |
|---|---|---|
| Screen | Upper ~60% of front, centered | ST7789P3 2.0" IPS, 240W × 320H portrait |
| Corner LEDs (×4) | TL, TR, BL, BR — ~3mm in from each corner | LED_TL=GPIO38, LED_TR=39, LED_BL=40, LED_BR=41 |
| IR TX | Top edge, left of center | TSAL6400 + 2N2222 driver, points forward |
| IR RX | Top edge, right of center | TSOP38238, points forward (line-of-sight beaconing) |
| Buttons row 1 (direction) | Below screen, 4 in a row | UP=GPIO4, DOWN=5, LEFT=6, RIGHT=7 |
| Buttons row 2 (action) | Below direction row | HOME=GPIO9, A=10, B=13, C=8 |
| USB-C | Bottom edge, centered | DevKit's native USB port (CDC + MSC + HID) |
| Battery | Back side (PCB phase) | LiPo cell, JST-PH |
| Power switch | Side edge (PCB phase) | Slide switch |

## Rationale for this layout (Tufty-classic, 2-row buttons)

- **Direction row on top** of the action row matches how the eyes scan: directions first (where to move?), then actions (what to do?)
- **HOME at far-left** of the action row — universal "back / menu" idiom, easiest thumb target when held in either hand
- **IR pair at top edge** so when two badges face each other (worn or held up), line of sight is clear
- **Corner LEDs at all four corners** create an even peripheral glow rather than concentrated in one spot
- **USB-C at the bottom** so the cable hangs naturally when the badge is on a desk for development

## What this layout enforces

1. **Breadboard component clustering** — when wiring, group the buttons into two physical rows on the breadboard the same way they'll appear on the final badge. Builds correct muscle memory while testing.
2. **Pygame visualizer geometry** — the sim window mirrors this exact layout. Keyboard mappings map onto the labeled positions.
3. **PCB silkscreen** — this drawing is the spec for the eventual artwork.

## Open questions (for PCB phase, not breadboard)

- Lanyard: single center hole vs. two outer holes?
- Polycarbonate front cover or bare PCB aesthetic?
- Reset / BOOT buttons exposed on front or recessed on back?
- Qw/ST or STEMMA QT connector on side edge?
