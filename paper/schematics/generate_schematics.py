#!/usr/bin/env python3
"""Generate two self-contained publication schematics in KiCad format."""

from pathlib import Path
from uuid import UUID, uuid5

OUT = Path(__file__).resolve().parent
NS = UUID("fa071a6f-e9d7-4ccf-9c08-b11f6b576afe")
LIB = "oreo_paper"


def uid(name):
    return str(uuid5(NS, name))


def fx(size=1.27, hide=False, justify=None, bold=False):
    font = f"(font (size {size} {size})" + (" (bold yes)" if bold else "") + ")"
    extra = (f" (justify {justify})" if justify else "") + (" (hide yes)" if hide else "")
    return f"(effects {font}{extra})"


def pin(name, number, side, y, kind="bidirectional"):
    return dict(name=name, number=str(number), side=side, y=y, kind=kind,
                x=(-25.4 if side == "left" else 25.4),
                angle=(0 if side == "left" else 180))


def symbol_def(name, pins, half_height, body_text=(), qualified=True):
    sym_name = f"{LIB}:{name}" if qualified else name
    lines = [
        f'(symbol "{sym_name}"',
        '  (pin_names (offset 1.016))',
        '  (exclude_from_sim no) (in_bom yes) (on_board yes)',
        f'  (property "Reference" "U" (at 0 {-half_height - 3.81} 0) {fx()})',
        f'  (property "Value" "{name}" (at 0 {half_height + 3.81} 0) {fx()})',
        f'  (property "Footprint" "" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Description" "" (at 0 0 0) {fx(hide=True)})',
        f'  (symbol "{name}_0_1"',
        f'    (rectangle (start -22.86 {-half_height}) (end 22.86 {half_height})',
        '      (stroke (width 0.254) (type solid)) (fill (type background)))',
    ]
    for index, text in enumerate(body_text):
        y = (index - (len(body_text) - 1) / 2) * 3.2
        lines += [f'    (text "{text}" (at 0 {y} 0) {fx(0.82)})']
    lines += ["  )", f'  (symbol "{name}_1_1"']
    for p in pins:
        lines += [
            f'    (pin {p["kind"]} line (at {p["x"]} {p["y"]} {p["angle"]}) (length 2.54)',
            f'      (name "{p["name"]}" {fx(1.0)})',
            f'      (number "{p["number"]}" {fx(1.0)}))',
        ]
    lines += ["  )", "  (embedded_fonts no)", ")"]
    return "\n".join(lines)


def placed(project, root, name, ref, value, x, y, pins):
    lines = [
        "(symbol", f'  (lib_id "{LIB}:{name}")', f"  (at {x} {y} 0) (unit 1)",
        "  (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)",
        f'  (uuid "{uid(project + ref)}")',
        f'  (property "Reference" "{ref}" (at {x} {y - 4} 0) {fx(hide=True)})',
        f'  (property "Value" "{value}" (at {x} {y + 4} 0) {fx(hide=True)})',
        f'  (property "Footprint" "" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Description" "" (at {x} {y} 0) {fx(hide=True)})',
    ]
    lines += [f'  (pin "{p["number"]}" (uuid "{uid(project + ref + p["number"])}"))'
              for p in pins]
    lines += ["  (instances", f'    (project "{project}"',
              f'      (path "/{root}" (reference "{ref}") (unit 1)))',
              "  )", ")"]
    return "\n".join(lines)


def endpoint(x, y, p):
    # KiCad symbol coordinates use positive Y upward, while schematic sheet
    # coordinates use positive Y downward.
    return x + p["x"], y - p["y"]


def wire(project, index, a, b):
    return (f"(wire (pts (xy {a[0]} {a[1]}) (xy {b[0]} {b[1]})) "
            f'(stroke (width 0) (type solid)) '
            f'(uuid "{uid(project + "wire" + str(index))}"))')


def nc(project, index, point):
    return f'(no_connect (at {point[0]} {point[1]}) (uuid "{uid(project + "nc" + str(index))}"))'


def note(project, index, text, x, y, size=1.27, bold=False):
    return (f'(text "{text}" (exclude_from_sim no) (at {x} {y} 0) '
            f'{fx(size, justify="left bottom", bold=bold)} '
            f'(uuid "{uid(project + "note" + str(index))}"))')


def schematic(project, title, definitions, instances, wires, notes, ncs=()):
    root = uid(project + "root")
    rows = ["(kicad_sch", "  (version 20250114)",
            '  (generator "oreo_schematic_generator")',
            '  (generator_version "1.0")', f'  (uuid "{root}")',
            '  (paper "A4")',
            f'  (title_block (title "{title}") (rev "1.0")',
            '    (company "OreoOS / RV565 experimental platform"))',
            "  (lib_symbols"]
    rows += ["    " + d.replace("\n", "\n    ") for d in definitions]
    rows += ["  )"]
    rows += ["  " + x for x in notes]
    rows += ["  " + x for x in ncs]
    rows += ["  " + x for x in wires]
    rows += ["  " + x.replace("\n", "\n  ") for x in instances]
    rows += ['  (sheet_instances (path "/" (page "1")))',
             "  (embedded_fonts no)", ")"]
    return "\n".join(rows) + "\n"


DEV_VIDEO = [
    pin("5V", 1, "right", -17.5, "power_out"),
    pin("GND", 2, "right", -12.5, "power_out"),
    pin("GPIO17 / BL", 17, "right", -7.5),
    pin("GPIO15 / DC", 15, "right", -2.5),
    pin("GPIO12 / SCK", 12, "right", 2.5),
    pin("GPIO11 / MOSI", 11, "right", 7.5),
    pin("GPIO14 / CS", 14, "right", 12.5),
    pin("GPIO16 / RESET", 16, "right", 17.5),
]
LCD = [
    pin("VCC", 1, "left", -20, "power_in"),
    pin("GND", 2, "left", -15, "power_in"),
    pin("EN", 3, "left", -10, "input"),
    pin("DC", 4, "left", -5, "input"),
    pin("SCL", 5, "left", 0, "input"),
    pin("SDA", 6, "left", 5, "input"),
    pin("CS", 7, "left", 10, "input"),
    pin("RST", 8, "left", 15, "input"),
    pin("TE", 9, "left", 20, "output"),
]
DEV_FULL = [
    pin("GPIO4 / UP", 4, "left", -42.5), pin("GPIO5 / DOWN", 5, "left", -37.5),
    pin("GPIO6 / LEFT", 6, "left", -32.5), pin("GPIO7 / RIGHT", 7, "left", -27.5),
    pin("GPIO8 / C", 8, "left", -22.5), pin("GPIO9 / HOME", 9, "left", -17.5),
    pin("GPIO10 / A", 10, "left", -12.5), pin("GPIO13 / B", 13, "left", -7.5),
    pin("BUTTON GND", 55, "left", -2.5, "power_out"),
    pin("USB D-", 19, "left", 25), pin("USB D+", 20, "left", 30),
    pin("USB 5V", 51, "left", 35, "power_in"),
    pin("USB GND", 52, "left", 40, "power_in"),
    pin("GPIO11 / MOSI", 11, "right", 7.5), pin("GPIO12 / SCK", 12, "right", 2.5),
    pin("GPIO14 / CS", 14, "right", 12.5), pin("GPIO15 / DC", 15, "right", -2.5),
    pin("GPIO16 / RESET", 16, "right", 17.5), pin("GPIO17 / BL", 17, "right", -7.5),
    pin("5V", 53, "right", -17.5, "power_out"), pin("GND", 54, "right", -12.5, "power_out"),
    pin("GPIO21 / TEST IN", 21, "right", 30),
    pin("GPIO33 / TEST ACK", 33, "right", 35),
    pin("TEST GND", 56, "right", 45, "power_out"),
]
BUTTONS = [pin(n, i + 1, "right", -17.5 + 5 * i, "output")
           for i, n in enumerate(("UP", "DOWN", "LEFT", "RIGHT", "C", "HOME", "A", "B"))]
BUTTONS.append(pin("COMMON GND", 9, "right", 22.5, "power_in"))
USB = [pin("D-", 1, "right", -7.5), pin("D+", 2, "right", -2.5),
       pin("VBUS", 3, "right", 2.5, "power_out"),
       pin("GND", 4, "right", 7.5, "power_out")]
MEASURE = [pin("STIMULUS", 1, "left", -7.5, "output"),
           pin("ACK", 2, "left", -2.5, "input"),
           pin("GND", 3, "left", 7.5, "power_in")]

SPECS = {
    "DEVKIT_VIDEO": (DEV_VIDEO, 22.5, ("U1: ESP32-S3 DevKitC-1 N16R8",
                                      "16 MiB flash / 8 MiB octal PSRAM")),
    "ST7789P3_MODULE": (LCD, 25, ("LCD1: SmartElex 2.0-inch IPS", "320 x 240 RGB565")),
    "DEVKIT_FULL": (DEV_FULL, 47.5, ("U1: ESP32-S3 DevKitC-1",
                                    "N16R8 / dual LX7 / Wi-Fi / BLE",
                                    "16 MiB flash / 8 MiB PSRAM")),
    "BUTTON_BANK": (BUTTONS, 27.5, ("SW1-SW8: momentary switches",
                                   "active-low to common GND",
                                   "internal pull-ups / 8 ms debounce")),
    "USB_HOST": (USB, 12.5, ("J1: USB-C host", "power / flash / serial")),
    "MEASUREMENT_HEADER": (MEASURE, 12.5, ("J2: logic analyser",
                                         "measurement firmware only")),
}
DEFS = {name: symbol_def(name, *spec) for name, spec in SPECS.items()}


def make_lcd():
    project, root = "lcd_interface", uid("lcd_interfaceroot")
    ux, uy, lx, ly = 70, 95, 220, 92.5
    instances = [
        placed(project, root, "DEVKIT_VIDEO", "U1", "ESP32-S3-DevKitC-1 N16R8",
               ux, uy, DEV_VIDEO),
        placed(project, root, "ST7789P3_MODULE", "LCD1", "ST7789P3 320x240",
               lx, ly, LCD),
    ]
    wires = [wire(project, i, endpoint(ux, uy, a), endpoint(lx, ly, b))
             for i, (a, b) in enumerate(zip(DEV_VIDEO, LCD[:8]), 1)]
    labels = ("5V power", "common ground", "PWM backlight", "data / command",
              "SPI2 SCK, 40 MHz", "SPI2 MOSI", "chip select", "active-low reset")
    notes = [
        note(project, 1, "DISPLAY INTERFACE USED BY THE RV565 EXPERIMENT",
             25, 25, 2.0, True),
        note(project, 2, "4-wire write-only SPI; panel MISO is not present",
             25, 31, 1.25),
        note(project, 3, "LCD VCC uses 5V; the module includes its own 3.3V regulator.",
             25, 168, 1.15),
        note(project, 4, "Keep SCL, SDA, CS and DC short and bundled at 40 MHz. TE is unconnected.",
             25, 174, 1.15),
    ]
    notes += [note(project, 10 + i, label, 125, endpoint(ux, uy, p)[1] - 1, 1.0)
              for i, (label, p) in enumerate(zip(labels, DEV_VIDEO))]
    return schematic(project, "RV565 LCD interface",
                     [DEFS["DEVKIT_VIDEO"], DEFS["ST7789P3_MODULE"]],
                     instances, wires, notes, [nc(project, 1, endpoint(lx, ly, LCD[8]))])


def make_platform():
    project, root = "experimental_platform", uid("experimental_platformroot")
    ux, uy, bx, by, lx, ly = 140, 105, 42, 130, 210, 102.5
    hx, hy, mx, my = 42, 72.5, 260, 67.5
    instances = [
        placed(project, root, "DEVKIT_FULL", "U1", "ESP32-S3-DevKitC-1 N16R8",
               ux, uy, DEV_FULL),
        placed(project, root, "BUTTON_BANK", "SW1-SW8",
               "HOME / A / B / C / D-pad", bx, by, BUTTONS),
        placed(project, root, "ST7789P3_MODULE", "LCD1", "ST7789P3 320x240",
               lx, ly, LCD),
        placed(project, root, "USB_HOST", "J1", "USB-C HOST", hx, hy, USB),
        placed(project, root, "MEASUREMENT_HEADER", "J2", "LATENCY TEST",
               mx, my, MEASURE),
    ]
    pairs = []
    pairs += [(endpoint(ux, uy, a), endpoint(bx, by, b))
              for a, b in zip(DEV_FULL[:8], BUTTONS)]
    pairs.append((endpoint(ux, uy, DEV_FULL[8]), endpoint(bx, by, BUTTONS[8])))
    pairs += [(endpoint(ux, uy, a), endpoint(hx, hy, b))
              for a, b in zip(DEV_FULL[9:13], USB)]
    lcd_order = (5, 4, 6, 3, 7, 2, 0, 1)
    pairs += [(endpoint(ux, uy, a), endpoint(lx, ly, LCD[i]))
              for a, i in zip(DEV_FULL[13:21], lcd_order)]
    pairs += [(endpoint(ux, uy, a), endpoint(mx, my, b))
              for a, b in zip(DEV_FULL[21:24], MEASURE)]
    wires = [wire(project, i, a, b) for i, (a, b) in enumerate(pairs, 1)]
    notes = [
        note(project, 1, "COMPLETE RV565 EXPERIMENTAL PLATFORM", 22, 20, 2.0, True),
        note(project, 2, "Board-level schematic of the tested breadboard configuration",
             22, 26, 1.25),
        note(project, 3, "LCD: GPIO11 MOSI, 12 SCK, 14 CS, 15 DC, 16 RST, 17 BL",
             22, 174, 1.05),
        note(project, 4, "Buttons connect to GND; internal pull-ups make each press active-low.",
             22, 180, 1.05),
        note(project, 5, "J2: GPIO21 stimulus; GPIO33 action-entry marker for latency capture.",
             22, 186, 1.05),
        note(project, 6, "J2 is measurement-firmware only; both pins remain reserved normally.",
             22, 192, 1.05),
    ]
    return schematic(project, "RV565 experimental platform",
                     [DEFS[x] for x in ("DEVKIT_FULL", "BUTTON_BANK",
                                        "ST7789P3_MODULE", "USB_HOST",
                                        "MEASUREMENT_HEADER")],
                     instances, wires, notes, [nc(project, 1, endpoint(lx, ly, LCD[8]))])


def make_library():
    defs = [symbol_def(name, *spec, qualified=False) for name, spec in SPECS.items()]
    return ("(kicad_symbol_lib\n  (version 20251024)\n"
            '  (generator "oreo_schematic_generator")\n'
            '  (generator_version "1.0")\n' +
            "\n".join("  " + d.replace("\n", "\n  ") for d in defs) +
            "\n)\n")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "oreo_paper.kicad_sym").write_text(make_library())
    (OUT / "lcd_interface.kicad_sch").write_text(make_lcd())
    (OUT / "experimental_platform.kicad_sch").write_text(make_platform())
    print("Generated KiCad sources in", OUT)


if __name__ == "__main__":
    main()
