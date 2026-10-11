#!/usr/bin/env python3
"""Generate the native KiCad schematic from the verified wiring map."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from kiutils.items.common import Effects, Font, Position, Property, TitleBlock
from kiutils.items.schitems import (
    Connection,
    Junction,
    LocalLabel,
    NoConnect,
    SchematicSymbol,
    SymbolProjectInstance,
    SymbolProjectPath,
    Text,
)
from kiutils.schematic import Schematic
from kiutils.symbol import Symbol, SymbolLib

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "hardware" / "28c64_programmer.kicad_sch"
PROJECT = "28c64_programmer"


def uid(name: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://elixpo.dev/28c64-programmer/{name}"))


def load_symbol(library: str, entry: str, embedded_name: str | None = None) -> Symbol:
    symbols = SymbolLib.from_file(f"/usr/share/kicad/symbols/{library}.kicad_sym").symbols
    symbol = deepcopy(next(item for item in symbols if item.entryName == entry))
    symbol.libraryNickname = library
    new_name = embedded_name or entry
    symbol.entryName = new_name
    for unit in symbol.units:
        if unit.entryName.startswith(entry):
            unit.entryName = new_name + unit.entryName[len(entry) :]
    return symbol


def all_pin_numbers(symbol: Symbol) -> list[str]:
    numbers: set[str] = set()
    for unit in symbol.units:
        numbers.update(pin.number for pin in unit.pins)
    numbers.update(pin.number for pin in symbol.pins)
    return sorted(numbers, key=lambda value: int(value) if value.isdigit() else value)


def effects(size: float = 1.27, bold: bool = False, hidden: bool = False) -> Effects:
    return Effects(font=Font(height=size, width=size, bold=bold), hide=hidden)


def instance(
    symbol: Symbol,
    reference: str,
    value: str,
    x: float,
    y: float,
    root_uuid: str,
    footprint: str = "",
    angle: float = 0,
    reference_at: tuple[float, float] | None = None,
    value_at: tuple[float, float] | None = None,
) -> SchematicSymbol:
    symbol_uuid = uid(reference)
    reference_x, reference_y = reference_at or (x - 3, y - 3)
    value_x, value_y = value_at or (x - 3, y + 3)
    props = [
        Property("Reference", reference, position=Position(reference_x, reference_y, 0), effects=effects()),
        Property("Value", value, position=Position(value_x, value_y, 0), effects=effects()),
        Property("Footprint", footprint, position=Position(x, y, 0), effects=effects(hidden=True)),
        Property("Datasheet", "", position=Position(x, y, 0), effects=effects(hidden=True)),
        Property("Description", "", position=Position(x, y, 0), effects=effects(hidden=True)),
    ]
    return SchematicSymbol(
        libraryNickname=symbol.libraryNickname,
        entryName=symbol.entryName,
        position=Position(x, y, angle),
        unit=1,
        inBom=True,
        onBoard=True,
        uuid=symbol_uuid,
        properties=props,
        pins={number: uid(f"{reference}-pin-{number}") for number in all_pin_numbers(symbol)},
        instances=[
            SymbolProjectInstance(
                name=PROJECT,
                paths=[SymbolProjectPath(f"/{root_uuid}", reference, 1)],
            )
        ],
    )


def label(name: str, x: float, y: float, angle: float = 0) -> LocalLabel:
    return LocalLabel(
        text=name,
        position=Position(x, y, angle),
        effects=effects(1.0),
        uuid=uid(f"label-{name}-{x}-{y}"),
    )


def no_connect(name: str, x: float, y: float) -> NoConnect:
    return NoConnect(position=Position(x, y, 0), uuid=uid(f"nc-{name}-{x}-{y}"))


def wire(schematic: Schematic, name: str, *points: tuple[float, float]) -> None:
    clean = [(round(x, 2), round(y, 2)) for x, y in points]
    for index, (start, end) in enumerate(zip(clean, clean[1:])):
        if start == end:
            continue
        schematic.graphicalItems.append(
            Connection(
                type="wire",
                points=[Position(*start), Position(*end)],
                uuid=uid(f"wire-{name}-{index}-{start}-{end}"),
            )
        )


def junction(schematic: Schematic, name: str, point: tuple[float, float]) -> None:
    x, y = point
    schematic.junctions.append(
        Junction(position=Position(round(x, 2), round(y, 2)), uuid=uid(f"junction-{name}-{x}-{y}"))
    )


def add_net(
    schematic: Schematic, name: str, x: float, y: float, dx: float, dy: float
) -> None:
    """Connect a pin to a named net with enough space for readable labels."""
    end_x, end_y = x + dx, y + dy
    schematic.graphicalItems.append(
        Connection(
            type="wire",
            points=[Position(x, y), Position(end_x, end_y)],
            uuid=uid(f"wire-{name}-{x}-{y}-{end_x}-{end_y}"),
        )
    )
    schematic.labels.append(label(name, end_x, end_y))


def add_symbol_net(
    schematic: Schematic,
    name: str,
    origin: tuple[float, float],
    point: tuple[float, float],
) -> None:
    x, y = pin_xy(origin, *point)
    local_x, local_y = point
    if abs(local_y) >= 25.4 and abs(local_x) <= 5.08:
        dx, dy = 0, (-5.08 if local_y > 0 else 5.08)
    else:
        dx, dy = (-5.08 if local_x < 0 else 5.08), 0
    add_net(schematic, name, x, y, dx, dy)


def note(text: str, x: float, y: float, size: float = 1.27, bold: bool = False) -> Text:
    return Text(
        text=text,
        position=Position(x, y, 0),
        effects=effects(size, bold=bold),
        uuid=uid(f"note-{text}-{x}-{y}"),
    )


def pin_xy(origin: tuple[float, float], local_x: float, local_y: float) -> tuple[float, float]:
    return origin[0] + local_x, origin[1] - local_y


def main() -> None:
    schematic = Schematic.create_new()
    schematic.version = "20231120"
    schematic.uuid = uid("root")
    schematic.generator = "eeprom28c64_schematic_generator"
    schematic.titleBlock = TitleBlock(
        title="Arduino Nano AT28C64B Programmer",
        date="2026-10-11",
        revision="v10",
        company="Elixpo",
        comments={1: "Protected writes; reset-safe controlled /CE"},
    )

    # The v2.x library drawing exposes the same Nano header pins used here and
    # is embedded unchanged so KiCad can validate it against the stock library.
    nano = load_symbol("MCU_Module", "Arduino_Nano_v2.x")
    shift = load_symbol("74xx", "74HC595")
    eeprom = load_symbol("Memory_EEPROM", "KM28C64A")
    resistor = load_symbol("Device", "R")
    led = load_symbol("Device", "LED")
    capacitor = load_symbol("Device", "C")
    power_flag = load_symbol("power", "PWR_FLAG")
    schematic.libSymbols = [nano, shift, eeprom, resistor, led, capacitor, power_flag]

    # All origins land on KiCad's 1.27 mm connection grid. The EEPROM and Nano
    # are vertically aligned so the eight data wires can run straight across.
    low = (120.65, 82.55)
    high = (120.65, 137.16)
    mem = (205.74, 95.25)
    n = (255.27, 74.93)
    schematic.schematicSymbols.extend(
        [
            instance(
                nano, "A1", "Arduino Nano v3", *n, schematic.uuid,
                "Module:Arduino_Nano", reference_at=(255.27, 44.45),
                value_at=(255.27, 105.41),
            ),
            instance(
                shift, "U1", "74HC595 (A0-A7)", *low, schematic.uuid,
                "Package_DIP:DIP-16_W7.62mm", reference_at=(120.65, 62.23),
                value_at=(120.65, 105.41),
            ),
            instance(
                shift, "U2", "74HC595 (A8-A12)", *high, schematic.uuid,
                "Package_DIP:DIP-16_W7.62mm", reference_at=(120.65, 116.84),
                value_at=(120.65, 160.02),
            ),
            instance(
                eeprom, "U3", "AT28C64B-15PC", *mem, schematic.uuid,
                "Package_DIP:DIP-28_W15.24mm", reference_at=(205.74, 62.23),
                value_at=(205.74, 128.27),
            ),
        ]
    )

    # Deliberately unused Nano pins.
    nano_unused = {
        "D0": (-12.7, 15.24), "D1": (-12.7, 12.7), "VIN": (-2.54, 25.4),
        "3V3": (2.54, 25.4), "RESET1": (12.7, 15.24), "RESET2": (12.7, 12.7),
        "AREF": (12.7, 5.08), "A1": (12.7, -2.54), "A2": (12.7, -5.08),
        "A4": (12.7, -10.16), "A6": (12.7, -15.24), "A7": (12.7, -17.78),
    }
    schematic.noConnects.extend(
        no_connect(name, *pin_xy(n, *point)) for name, point in nano_unused.items()
    )

    # EEPROM address and data pin coordinates.
    output_points = [(10.16, 10.16), (10.16, 7.62), (10.16, 5.08), (10.16, 2.54),
                     (10.16, 0), (10.16, -2.54), (10.16, -5.08), (10.16, -7.62)]
    address_points = [(-10.16, value) for value in
                      (22.86, 20.32, 17.78, 15.24, 12.7, 10.16, 7.62,
                       5.08, 2.54, 0, -2.54, -5.08, -7.62)]
    data_points = [(10.16, 22.86), (10.16, 20.32), (10.16, 17.78), (10.16, 15.24),
                   (10.16, 12.7), (10.16, 10.16), (10.16, 7.62), (10.16, 5.08)]

    # Straight A0-A7 wires from the low-address register.
    for index, point in enumerate(output_points):
        wire(schematic, f"A{index}", pin_xy(low, *point), pin_xy(mem, *address_points[index]))

    # A8-A12 use a tidy five-line fan-out above the high-address register.
    for index, point in enumerate(output_points[:5]):
        source = pin_xy(high, *point)
        target = pin_xy(mem, *address_points[index + 8])
        channel_x = 139.7 + index * 7.62
        wire(schematic, f"A{index + 8}", source, (channel_x, source[1]),
             (channel_x, target[1]), target)

    # The eight data lines run directly between EEPROM and Nano D5-D12.
    for index, point in enumerate(data_points):
        wire(schematic, f"IO{index}", pin_xy(mem, *point), pin_xy(n, -12.7, 2.54 - 2.54 * index))

    # D2 feeds the first 595. D3 and D4 are shared clock/latch trunks.
    d2 = pin_xy(n, -12.7, 10.16)
    d3 = pin_xy(n, -12.7, 7.62)
    d4 = pin_xy(n, -12.7, 5.08)
    wire(schematic, "SER-D2", d2, (237.49, d2[1]), (237.49, 54.61),
         (105.41, 54.61), (105.41, pin_xy(low, -10.16, 10.16)[1]),
         pin_xy(low, -10.16, 10.16))
    for name, source, local_y, trunk_x in (
        ("SRCLK-D3", d3, 5.08, 101.6),
        ("RCLK-D4", d4, -2.54, 97.79),
    ):
        low_pin = pin_xy(low, -10.16, local_y)
        high_pin = pin_xy(high, -10.16, local_y)
        wire(schematic, name, source, (source[0], 48.26 if name.startswith("SRCLK") else 44.45),
             (trunk_x, 48.26 if name.startswith("SRCLK") else 44.45),
             (trunk_x, high_pin[1]))
        wire(schematic, f"{name}-U1", (trunk_x, low_pin[1]), low_pin)
        wire(schematic, f"{name}-U2", (trunk_x, high_pin[1]), high_pin)
        junction(schematic, f"{name}-U1", (trunk_x, low_pin[1]))
        junction(schematic, f"{name}-U2", (trunk_x, high_pin[1]))

    # QH' of the first register feeds SER of the second register.
    cascade_source = pin_xy(low, 10.16, -12.7)
    cascade_target = pin_xy(high, -10.16, 10.16)
    wire(schematic, "CASCADE", cascade_source, (134.62, cascade_source[1]),
         (134.62, cascade_target[1]), cascade_target)

    # High-register unused outputs are explicitly marked no-connect.
    for index, point in enumerate(output_points[5:], start=5):
        schematic.noConnects.append(no_connect(f"U2-Q{index}", *pin_xy(high, *point)))
    schematic.noConnects.append(no_connect("U2-QH-prime", *pin_xy(high, 10.16, -12.7)))

    # Pull-ups, A5 status LED, bypass capacitors, and the ground power flag.
    extras = [
        (resistor, "R1", "10k", 177.8, 48.26, 0, (174.0, 42.0), (174.0, 57.0)),
        (resistor, "R2", "10k", 186.69, 48.26, 0, (183.0, 42.0), (183.0, 57.0)),
        (resistor, "R3", "10k", 195.58, 48.26, 0, (192.0, 42.0), (192.0, 57.0)),
        (resistor, "R4", "680R", 278.13, 111.76, 0, (272.0, 105.0), (271.0, 118.0)),
        (led, "D1", "STATUS", 278.13, 125.73, 0, (272.0, 121.0), (271.0, 132.0)),
        (capacitor, "C1", "100n U1", 60.96, 104.14, 0, (57.0, 96.5), (56.0, 114.3)),
        (capacitor, "C2", "100n U2", 73.66, 104.14, 0, (70.0, 96.5), (68.5, 114.3)),
        (capacitor, "C3", "100n U3", 86.36, 104.14, 0, (82.5, 96.5), (81.0, 114.3)),
        (power_flag, "#FLG01", "PWR_FLAG", 99.06, 170.18, 0, (92.0, 166.0), (92.0, 176.0)),
    ]
    for symbol, reference, value, x, y, angle, reference_at, value_at in extras:
        schematic.schematicSymbols.append(
            instance(
                symbol, reference, value, x, y, schematic.uuid, angle=angle,
                reference_at=reference_at, value_at=value_at,
            )
        )

    # Visible +5 V and ground rails.
    wire(schematic, "+5V-RAIL", (60.96, 38.1), (260.35, 38.1))
    wire(schematic, "GND-RAIL", (60.96, 170.18), (274.32, 170.18))
    schematic.labels.extend((label("+5V", 60.96, 38.1), label("GND", 60.96, 170.18)))

    # Device power, 595 reset/output-enable, and both Nano ground pins.
    power_pins = [
        pin_xy(low, 0, 15.24), pin_xy(high, 0, 15.24), pin_xy(mem, 0, 27.94),
        pin_xy(n, 5.08, 25.4), pin_xy(low, -10.16, 2.54), pin_xy(high, -10.16, 2.54),
    ]
    for index, point in enumerate(power_pins):
        wire(schematic, f"POWER-{index}", point, (point[0], 38.1))
        junction(schematic, f"POWER-{index}", (point[0], 38.1))
    ground_pins = [
        pin_xy(low, 0, -17.78), pin_xy(high, 0, -17.78), pin_xy(mem, 0, -27.94),
        pin_xy(n, 0, -25.4), pin_xy(n, 2.54, -25.4),
        pin_xy(low, -10.16, -5.08), pin_xy(high, -10.16, -5.08),
    ]
    for index, point in enumerate(ground_pins):
        wire(schematic, f"GROUND-{index}", point, (point[0], 170.18))
        junction(schematic, f"GROUND-{index}", (point[0], 170.18))

    # Three bypass capacitors are visibly wired across the same rails.
    for index, x in enumerate((60.96, 73.66, 86.36), start=1):
        wire(schematic, f"C{index}-VCC", (x, 100.33), (x, 38.1))
        wire(schematic, f"C{index}-GND", (x, 107.95), (x, 170.18))
        junction(schematic, f"C{index}-VCC", (x, 38.1))
        junction(schematic, f"C{index}-GND", (x, 170.18))

    # /WE, /OE, and /CE each have a 10k pull-up and a direct Nano wire.
    control_targets = [
        pin_xy(mem, -10.16, -17.78), pin_xy(mem, -10.16, -20.32),
        pin_xy(mem, -10.16, -22.86),
    ]
    for index, (x, target) in enumerate(zip((177.8, 186.69, 195.58), control_targets), start=1):
        wire(schematic, f"R{index}-VCC", (x, 44.45), (x, 38.1))
        wire(schematic, f"R{index}-CONTROL", (x, 52.07), (x, target[1]), target)
        junction(schematic, f"R{index}-VCC", (x, 38.1))
        junction(schematic, f"CONTROL-{index}", target)
    we_source = pin_xy(n, -12.7, -17.78)
    oe_source = pin_xy(n, 12.7, 0)
    ce_source = pin_xy(n, 12.7, -7.62)
    wire(schematic, "WE-D13", we_source, (232.41, we_source[1]),
         (232.41, control_targets[0][1]), control_targets[0])
    wire(schematic, "OE-A0", oe_source, (273.05, oe_source[1]),
         (273.05, 151.13), (190.5, 151.13), (190.5, control_targets[1][1]),
         control_targets[1])
    wire(schematic, "CE-A3", ce_source, (269.24, ce_source[1]),
         (269.24, 156.21), (185.42, 156.21), (185.42, control_targets[2][1]),
         control_targets[2])

    # Nano A5 -> resistor -> LED -> ground. A6/A7 are input-only.
    status_source = pin_xy(n, 12.7, -12.7)
    wire(schematic, "STATUS-A5", status_source, (278.13, status_source[1]), (278.13, 107.95))
    wire(schematic, "STATUS-R-LED", (278.13, 115.57), (281.94, 115.57), (281.94, 125.73))
    wire(schematic, "STATUS-GND", (274.32, 125.73), (274.32, 170.18))
    junction(schematic, "STATUS-GND", (274.32, 170.18))
    junction(schematic, "PWR-FLAG", (99.06, 170.18))

    schematic.texts.extend(
        [
            note("BYPASS CAPACITORS", 55.88, 82.55, 1.5, True),
            note("ADDRESS REGISTERS", 105.41, 25.4, 1.7, True),
            note("AT28C64B EEPROM", 190.5, 25.4, 1.7, True),
            note("ARDUINO NANO", 245.11, 25.4, 1.7, True),
            note("A0-A12 ADDRESS BUS", 144.78, 68.58, 1.1, True),
            note("D5-D12 DATA BUS", 222.25, 68.58, 1.1, True),
            note("A5 STATUS", 274.32, 137.16, 1.1, True),
            note("/CE is controlled by A3 and pulled high. Never tie /CE to GND when /WE uses D13.", 55.88, 182.88, 1.1, True),
        ]
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    schematic.to_file(OUTPUT, encoding="utf-8")
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    main()
