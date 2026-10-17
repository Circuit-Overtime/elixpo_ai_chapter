#!/usr/bin/env python3
"""Generate the publication-quality Diffuino selector schematic.

Signal connections are drawn as wires. Only the standard +5V/GND power symbols
are used as global nets; this keeps the complete circuit auditable on one sheet.
"""

from pathlib import Path

import kicad_sch_api as ksa
from kicad_sch_api.core.geometry import snap_to_grid


HERE = Path(__file__).resolve().parent
sch = ksa.create_schematic("Diffuino BCD Selector")
sch.set_paper_size("A3")
sch.set_title_block(
    title="Diffuino BCD selector, validity interlock, and reset",
    rev="2.0",
    company="MonoDiffuse",
    comments={1: "Arduino UNO Q / STM32 digital interface", 2: "D2-D7 only; do not use 1.8 V MPU GPIO"},
)


def add(lib, ref, value, x, y, *, rotation=0, footprint=None):
    return sch.components.add(
        lib, reference=ref, value=value, position=(x, y), rotation=rotation, footprint=footprint
    )


def point(ref, pin):
    pos = sch.components.get(ref).get_pin_position(str(pin))
    return (pos.x, pos.y)


def snap(position):
    return snap_to_grid(position, grid_size=1.27)


def wire(*points):
    for start, end in zip(points, points[1:]):
        sch.add_wire(snap(start), snap(end))


def junction(position):
    sch.junctions.add(snap(position))


def power(net, position, ref):
    add("power:+5V" if net == "+5V" else "power:GND", ref, net, *snap(position))


def note(text, x, y, size=1.27):
    sch.add_text(text, (x, y), size=size)


RES_SMD = "Resistor_SMD:R_0805_2012Metric"
CAP_SMD = "Capacitor_SMD:C_0805_2012Metric"
LED_SMD = "LED_SMD:LED_0805_2012Metric"
LOGIC_SMD = "Package_TO_SOT_SMD:SOT-23-5"
SWITCH_THT = "Button_Switch_THT:SW_DIP_SPSTx01_Slide_9.78x4.72mm_W7.62mm_P2.54mm"
BUTTON_THT = "Button_Switch_THT:SW_PUSH_6mm"

note("DIFFUINO — COMPLETE BCD INPUT AND CONTROL CIRCUIT", 205.0, 15.0, 2.0)
note("Hardware validity:  VALID = NOT [ BCD3 AND (BCD2 OR BCD1) ]", 205.0, 21.0, 1.27)

# BCD switches, filtering, protection, indicators, and UNO Q connector.
note("1. BCD SELECTOR, INPUT FILTERS, AND VISIBLE BIT INDICATORS", 92.0, 31.0, 1.27)
note("ON = +5 V     OFF = 10 kOhm pull-down", 58.0, 36.0, 1.0)

rows = [(3, 45.0, "D5"), (2, 75.0, "D4"), (1, 105.0, "D3"), (0, 135.0, "D2")]
bit_nodes = {}

for index, (bit, y, gpio) in enumerate(rows, 1):
    sw, pull, filt = f"SW{index}", f"R{index}", f"C{index}"
    protect, led_r, led = f"R{index + 4}", f"R{index + 8}", f"D{index}"
    add("Switch:SW_SPST", sw, f"BCD{bit}", 45.0, y, footprint=SWITCH_THT)
    add("Device:R", pull, "10k", 65.0, y + 5.0, footprint=RES_SMD)
    add("Device:C", filt, "10nF", 80.0, y + 5.0, footprint=CAP_SMD)
    add("Device:R", protect, "1k", 105.0, y, rotation=90, footprint=RES_SMD)
    add("Device:R", led_r, "1k", 105.0, y + 12.0, rotation=90, footprint=RES_SMD)
    add("Device:LED", led, f"BCD{bit}", 125.0, y + 12.0, rotation=180, footprint=LED_SMD)

    sw_in, raw = point(sw, 1), point(sw, 2)
    pull_top, pull_bottom = point(pull, 2), point(pull, 1)
    cap_top, cap_bottom = point(filt, 2), point(filt, 1)
    series_in, series_out = point(protect, 1), point(protect, 2)
    led_r_in, led_r_out = point(led_r, 1), point(led_r, 2)
    led_anode, led_cathode = point(led, 2), point(led, 1)

    power("+5V", sw_in, f"#PWR{index:02d}")
    wire(raw, series_in)
    wire(raw, (pull_top[0], raw[1]), pull_top)
    junction((pull_top[0], raw[1]))
    wire((pull_top[0], raw[1]), (cap_top[0], raw[1]), cap_top)
    junction((cap_top[0], raw[1]))
    wire((cap_top[0], raw[1]), (92.0, raw[1]), (92.0, led_r_in[1]), led_r_in)
    junction((92.0, raw[1]))
    wire(led_r_out, led_anode)
    wire(pull_bottom, (pull_bottom[0], y + 18.0))
    power("GND", (pull_bottom[0], y + 18.0), f"#PWR{index + 4:02d}")
    wire(cap_bottom, (cap_bottom[0], y + 18.0))
    power("GND", (cap_bottom[0], y + 18.0), f"#PWR{index + 8:02d}")
    wire(led_cathode, (135.0, led_cathode[1]), (135.0, y + 18.0))
    power("GND", (135.0, y + 18.0), f"#PWR{index + 12:02d}")
    bit_nodes[bit] = series_out

add(
    "Connector_Generic:Conn_01x08", "J1", "ARDUINO_UNO_Q", 180.0, 92.0,
    footprint="Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical",
)
note("UNO Q STM32 HEADER", 180.0, 73.0, 1.27)
# kicad-sch-api 0.5.x mirrors the vertical pin coordinates of this connector
# during serialization. Convert the logical pin number to the physical point
# KiCad renders so every visible wire lands on the intended numbered pin.
def jpin(number):
    mirrored = point("J1", 9 - number)
    return (mirrored[0], mirrored[1] + 2.54)


power("+5V", jpin(1), "#PWR17")
power("GND", jpin(2), "#PWR18")

pin_for_bit = {0: 3, 1: 4, 2: 5, 3: 6}
lanes = {3: 144.0, 2: 148.0, 1: 152.0, 0: 156.0}
for bit, _y, _gpio in rows:
    start, target, lane = bit_nodes[bit], jpin(pin_for_bit[bit]), lanes[bit]
    wire(start, (lane, start[1]), (lane, target[1]), target)
    junction(start)

note("1  +5V", 200.0, jpin(1)[1], 0.9)
note("2  GND", 200.0, jpin(2)[1], 0.9)
for pin, label in [(3, "D2 / BCD0"), (4, "D3 / BCD1"), (5, "D4 / BCD2"), (6, "D5 / BCD3"), (7, "D6 / GENERATE"), (8, "D7 / RESET")]:
    note(f"{pin}  {label}", 200.0, jpin(pin)[1], 0.9)

# Hardware validity network. Long visible wires connect the BCD nodes.
note("2. HARDWARE DECIMAL-VALIDITY INTERLOCK", 275.0, 140.0, 1.27)
add("74xGxx:74AHC1G32", "U1", "74AHC1G32", 235.0, 175.0, footprint=LOGIC_SMD)
add("74xGxx:74AHC1G08", "U2", "74AHC1G08", 280.0, 175.0, footprint=LOGIC_SMD)
add("74xGxx:74AHC1G04", "U3", "74AHC1G04", 325.0, 175.0, footprint=LOGIC_SMD)

for bit, gate_pin, lane in [(2, 1, 205.0), (1, 2, 215.0)]:
    start, target = bit_nodes[bit], point("U1", gate_pin)
    wire(start, (lane, start[1]), (lane, target[1]), target)
    junction(start)

start, target = bit_nodes[3], point("U2", 1)
wire(start, (225.0, start[1]), (225.0, 162.0), (252.0, 162.0), (252.0, target[1]), target)
junction(start)
wire(point("U1", 4), (252.0, point("U1", 4)[1]), (252.0, point("U2", 2)[1]), point("U2", 2))
wire(point("U2", 4), point("U3", 2))

for unit, base in [("U1", 19), ("U2", 21), ("U3", 23)]:
    # The API mirrors vertical pin coordinates for these symbols as well.
    vcc, gnd = point(unit, 3), point(unit, 5)
    wire(vcc, (vcc[0], vcc[1] + 5.0))
    power("+5V", (vcc[0], vcc[1] + 5.0), f"#PWR{base:02d}")
    wire(gnd, (gnd[0], gnd[1] - 5.0))
    power("GND", (gnd[0], gnd[1] - 5.0), f"#PWR{base + 1:02d}")

note("BCD2 OR BCD1", 235.0, 190.0, 0.9)
note("BCD3 AND previous", 280.0, 190.0, 0.9)
note("VALID", 325.0, 190.0, 0.9)

# Generate button, request gate, and isolated indicator LED.
note("3. DEBOUNCED GENERATE REQUEST", 252.0, 207.0, 1.27)
add("Switch:SW_Push", "SW5", "GENERATE", 225.0, 225.0, footprint=BUTTON_THT)
add("Device:R", "R13", "10k", 247.0, 233.0, footprint=RES_SMD)
add("Device:C", "C5", "100nF", 262.0, 233.0, footprint=CAP_SMD)
add("74xGxx:74AHC1G08", "U4", "74AHC1G08", 300.0, 225.0, footprint=LOGIC_SMD)
add("Device:R", "R14", "1k", 330.0, 225.0, rotation=90, footprint=RES_SMD)

power("+5V", point("SW5", 1), "#PWR25")
generate_raw = point("SW5", 2)
wire(generate_raw, (point("R13", 2)[0], generate_raw[1]), point("R13", 2))
junction((point("R13", 2)[0], generate_raw[1]))
wire((point("R13", 2)[0], generate_raw[1]), (point("C5", 2)[0], generate_raw[1]), point("C5", 2))
junction((point("C5", 2)[0], generate_raw[1]))
wire((point("C5", 2)[0], generate_raw[1]), (278.0, generate_raw[1]), (278.0, point("U4", 1)[1]), point("U4", 1))
wire(point("R13", 1), (point("R13", 1)[0], 246.0))
power("GND", (point("R13", 1)[0], 246.0), "#PWR26")
wire(point("C5", 1), (point("C5", 1)[0], 246.0))
power("GND", (point("C5", 1)[0], 246.0), "#PWR27")

wire(point("U3", 4), (345.0, point("U3", 4)[1]), (345.0, 215.0), (278.0, 215.0), (278.0, point("U4", 2)[1]), point("U4", 2))
wire(point("U4", 4), point("R14", 1))
trigger_out, target_d6 = point("R14", 2), jpin(7)
wire(trigger_out, (350.0, trigger_out[1]), (350.0, 198.0), (195.0, 198.0), (195.0, target_d6[1]), target_d6)
junction(trigger_out)

vcc, gnd = point("U4", 3), point("U4", 5)
wire(vcc, (vcc[0], vcc[1] + 5.0))
power("+5V", (vcc[0], vcc[1] + 5.0), "#PWR28")
wire(gnd, (gnd[0], gnd[1] - 5.0))
power("GND", (gnd[0], gnd[1] - 5.0), "#PWR29")

note("BUFFERED REQUEST INDICATOR", 387.0, 177.0, 1.0)
add("Device:R", "R15", "10k", 360.0, 225.0, rotation=90, footprint=RES_SMD)
add("Transistor_BJT:Q_NPN_BCE", "Q1", "2N3904", 390.0, 225.0, footprint="Package_TO_SOT_THT:TO-92_Inline")
add("Device:LED", "D5", "GREEN", 390.0, 203.0, footprint="LED_THT:LED_D3.0mm")
add("Device:R", "R16", "1k", 390.0, 187.0, footprint=RES_SMD)
wire(trigger_out, point("R15", 1))
wire(point("R15", 2), point("Q1", 1))
wire(point("Q1", 3), (point("Q1", 3)[0], 239.0))
power("GND", (point("Q1", 3)[0], 239.0), "#PWR30")
wire(point("Q1", 2), (point("Q1", 2)[0], point("D5", 1)[1]), point("D5", 1))
wire(point("D5", 2), (point("R16", 1)[0], point("D5", 2)[1]), point("R16", 1))
wire(point("R16", 2), (point("R16", 2)[0], 176.0))
power("+5V", (point("R16", 2)[0], 176.0), "#PWR31")

# Reset / re-arm path.
note("4. DEBOUNCED RESET / RE-ARM", 82.0, 207.0, 1.27)
add("Switch:SW_Push", "SW6", "RESET", 45.0, 225.0, footprint=BUTTON_THT)
add("Device:R", "R17", "10k", 70.0, 233.0, footprint=RES_SMD)
add("Device:C", "C6", "100nF", 87.0, 233.0, footprint=CAP_SMD)
add("Device:R", "R18", "1k", 115.0, 225.0, rotation=90, footprint=RES_SMD)
power("+5V", point("SW6", 1), "#PWR32")
reset_raw = point("SW6", 2)
wire(reset_raw, (point("R17", 2)[0], reset_raw[1]), point("R17", 2))
junction((point("R17", 2)[0], reset_raw[1]))
wire((point("R17", 2)[0], reset_raw[1]), (point("C6", 2)[0], reset_raw[1]), point("C6", 2))
junction((point("C6", 2)[0], reset_raw[1]))
wire((point("C6", 2)[0], reset_raw[1]), point("R18", 1))
wire(point("R17", 1), (point("R17", 1)[0], 246.0))
power("GND", (point("R17", 1)[0], 246.0), "#PWR33")
wire(point("C6", 1), (point("C6", 1)[0], 246.0))
power("GND", (point("C6", 1)[0], 246.0), "#PWR34")
target_d7 = jpin(8)
wire(point("R18", 2), (185.0, point("R18", 2)[1]), (185.0, target_d7[1]), target_d7)

# Explicit supply bypassing.
note("5. LOCAL SUPPLY DECOUPLING", 357.0, 31.0, 1.27)
for offset, (ref, label) in enumerate([(f"C{i}", f"U{i - 6}") for i in range(7, 11)]):
    x = 330.0 + offset * 18.0
    add("Device:C", ref, "100nF", x, 60.0, footprint=CAP_SMD)
    wire(point(ref, 2), (point(ref, 2)[0], 50.0))
    power("+5V", (point(ref, 2)[0], 50.0), f"#PWR{35 + offset * 2:02d}")
    wire(point(ref, 1), (point(ref, 1)[0], 70.0))
    power("GND", (point(ref, 1)[0], 70.0), f"#PWR{36 + offset * 2:02d}")
    note(label, x, 78.0, 0.9)

add("Device:C_Polarized", "C11", "10uF", 357.0, 100.0, footprint="Capacitor_THT:C_Radial_D5.0mm_H5.0mm_P2.00mm")
wire(point("C11", 2), (point("C11", 2)[0], 90.0))
power("+5V", (point("C11", 2)[0], 90.0), "#PWR43")
wire(point("C11", 1), (point("C11", 1)[0], 110.0))
power("GND", (point("C11", 1)[0], 110.0), "#PWR44")
add("power:PWR_FLAG", "#FLG01", "PWR_FLAG", 380.0, 100.0)
wire(point("#FLG01", 1), (point("#FLG01", 1)[0], 90.0))
power("+5V", (point("#FLG01", 1)[0], 90.0), "#PWR45")
add("power:PWR_FLAG", "#FLG02", "PWR_FLAG", 400.0, 100.0)
wire(point("#FLG02", 1), (point("#FLG02", 1)[0], 110.0))
power("GND", (point("#FLG02", 1)[0], 110.0), "#PWR46")

note("Firmware: 40 ms debounce; BCD is latched for inference; D6 is ignored while busy; D7 restores the ready smiley.", 205.0, 278.0, 1.0)
note("D2-D7 are the UNO Q's 5 V-tolerant STM32 header inputs. Never connect this circuit to the 1.8 V MPU GPIO.", 205.0, 284.0, 1.0)

sch.save(HERE / "diffuino_selector.kicad_sch")
print(f"saved {HERE / 'diffuino_selector.kicad_sch'}")
