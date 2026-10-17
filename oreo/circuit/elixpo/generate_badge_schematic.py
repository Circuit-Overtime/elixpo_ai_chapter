#!/usr/bin/env python3
"""Generate the Oreo badge KiCad project schematics and preliminary BOM.

The source is intentionally data driven: every placed component carries a
reference, value, footprint, and named electrical nets.  The generated
schematics are self-contained and can be opened without a custom symbol
library.  Regenerate after changing a part or GPIO assignment with:

    python3 circuit/elixpo/generate_badge_schematic.py
"""

from csv import writer
from pathlib import Path
from uuid import UUID, uuid5


OUT = Path(__file__).resolve().parent
PROJECT = "elixpo"
LIB = "oreo_badge"
NS = UUID("11dfb61c-f4a7-4db0-8a38-f7922f779140")


def uid(name):
    return str(uuid5(NS, name))


def fx(size=1.27, hide=False, justify=None, bold=False):
    font = f"(font (size {size} {size})" + (" (bold yes)" if bold else "") + ")"
    extra = (f" (justify {justify})" if justify else "") + (" (hide yes)" if hide else "")
    return f"(effects {font}{extra})"


def component(ref, value, footprint, pins, x, y, note=""):
    """pins: iterable of (pin name, package pin number, net name)."""
    snap = lambda value: round(value / 1.27) * 1.27
    return dict(ref=ref, value=value, footprint=footprint, pins=list(pins),
                x=snap(x), y=snap(y), note=note)


def _layout_pins(pins):
    split = (len(pins) + 1) // 2
    left, right = pins[:split], pins[split:]
    # 5.08 mm keeps every pin on KiCad's 50 mil electrical grid, including
    # even-sized pin groups whose first offset is a half pitch.
    pitch = 5.08
    half = max(12.0, (max(len(left), len(right)) - 1) * pitch / 2 + 5)
    pin_x = 10.16 if len(pins) <= 4 else 25.4
    body_x = pin_x - 2.54
    laid = []
    for side, group in (("left", left), ("right", right)):
        for index, (name, number, net) in enumerate(group):
            y = (len(group) - 1) * pitch / 2 - index * pitch
            laid.append(dict(name=name, number=str(number), net=net, side=side,
                             x=-pin_x if side == "left" else pin_x, y=y,
                             angle=0 if side == "left" else 180))
    return laid, half, body_x


def symbol_def(key, comp):
    pins, half, body_x = _layout_pins(comp["pins"])
    rows = [
        f'(symbol "{LIB}:{key}"',
        '  (pin_names (offset 1.016))',
        '  (exclude_from_sim no) (in_bom yes) (on_board yes)',
        f'  (property "Reference" "U" (at 0 {-half - 3.8} 0) {fx()})',
        f'  (property "Value" "{comp["value"]}" (at 0 {half + 3.8} 0) {fx()})',
        f'  (property "Footprint" "{comp["footprint"]}" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Description" "{comp["note"]}" (at 0 0 0) {fx(hide=True)})',
        f'  (symbol "{key}_0_1"',
        f'    (rectangle (start {-body_x} {-half}) (end {body_x} {half})',
        '      (stroke (width 0.254) (type solid)) (fill (type background)))',
        f'    (text "{comp["value"]}" (at 0 0 0) {fx(1.05, bold=True)})',
        '  )',
        f'  (symbol "{key}_1_1"',
    ]
    for pin in pins:
        rows += [
            f'    (pin bidirectional line (at {pin["x"]} {pin["y"]} {pin["angle"]}) (length 2.54)',
            f'      (name "{pin["name"]}" {fx(0.9)})',
            f'      (number "{pin["number"]}" {fx(0.9)}))',
        ]
    rows += ['  )', '  (embedded_fonts no)', ')']
    return "\n".join(rows), pins, half


def placed(page, sheet_id, key, comp, pins, half):
    x, y, ref = comp["x"], comp["y"], comp["ref"]
    rows = [
        '(symbol', f'  (lib_id "{LIB}:{key}")', f'  (at {x} {y} 0) (unit 1)',
        '  (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)',
        f'  (uuid "{uid(page + ref)}")',
        f'  (property "Reference" "{ref}" (at {x} {y - half - 3.8} 0) {fx(1.1, bold=True)})',
        f'  (property "Value" "{comp["value"]}" (at {x} {y + half + 3.8} 0) {fx(1.0)})',
        f'  (property "Footprint" "{comp["footprint"]}" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Description" "{comp["note"]}" (at {x} {y} 0) {fx(hide=True)})',
    ]
    rows += [f'  (pin "{p["number"]}" (uuid "{uid(page + ref + p["number"])}"))' for p in pins]
    rows += ['  (instances', f'    (project "{PROJECT}"',
             f'      (path "/{sheet_id}/{uid(page + ref)}" (reference "{ref}") (unit 1)))',
             '  )', ')']
    return "\n".join(rows)


def endpoint(comp, pin):
    return comp["x"] + pin["x"], comp["y"] - pin["y"]


def global_label(page, ref, pin):
    net = pin["net"]
    x, y = endpoint(ref, pin)
    if (net.endswith("_INT") or net.endswith("_NC") or
            net in ("STRAP45", "STRAP46", "ANT_NC", "STATUS_DOUT")):
        return (f'(no_connect (at {x} {y}) '
                f'(uuid "{uid(page + ref["ref"] + pin["number"] + "nc")}"))')
    angle = 180 if pin["side"] == "left" else 0
    justify = "right" if pin["side"] == "left" else "left"
    return (f'(global_label "{net}" (shape bidirectional) (at {x} {y} {angle}) '
            f'{fx(0.9, justify=justify)} (uuid "{uid(page + ref["ref"] + pin["number"] + net + "label")}"))')


def note(page, index, text, x, y, size=1.1, bold=False):
    return (f'(text "{text}" (exclude_from_sim no) (at {x} {y} 0) '
            f'{fx(size, justify="left bottom", bold=bold)} '
            f'(uuid "{uid(page + "note" + str(index))}"))')


def page(name, title, sheet_id, components, notes):
    definitions, instances, labels = [], [], []
    for comp in components:
        key = comp["ref"].replace("#", "PWR")
        definition, pins, half = symbol_def(key, comp)
        definitions.append(definition)
        instances.append(placed(name, sheet_id, key, comp, pins, half))
        labels.extend(global_label(name, comp, pin) for pin in pins)

    rows = ['(kicad_sch', '  (version 20250114)',
            '  (generator "oreo_badge_generator")', '  (generator_version "1.0")',
            f'  (uuid "{uid(name + "root")}")', '  (paper "A3")',
            f'  (title_block (title "{title}") (rev "0.1")',
            '    (company "OreoOS open hardware badge"))', '  (lib_symbols']
    rows += ['    ' + item.replace('\n', '\n    ') for item in definitions]
    rows += ['  )']
    rows += ['  ' + item for item in labels]
    rows += ['  ' + note(name, i, *args) for i, args in enumerate(notes, 1)]
    rows += ['  ' + item.replace('\n', '\n  ') for item in instances]
    rows += ['  (embedded_fonts no)', ')']
    return "\n".join(rows) + "\n"


def p2(ref, value, fp, a, b, x, y, note_text=""):
    return component(ref, value, fp, [("1", 1, a), ("2", 2, b)], x, y, note_text)


R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"


MCU_PINS = [
    ("LNA_IN", 1, "RF_ANT"), ("VDD3P3", 2, "+3V3A"), ("VDD3P3", 3, "+3V3A"),
    ("CHIP_PU", 4, "EN"), ("GPIO0", 5, "BOOT"), ("GPIO1", 6, "VBAT_SENSE"),
    ("GPIO2", 7, "IR_TX"), ("GPIO3", 8, "IMU_INT"), ("GPIO4", 9, "BTN_UP"),
    ("GPIO5", 10, "BTN_DOWN"), ("GPIO6", 11, "BTN_LEFT"), ("GPIO7", 12, "BTN_RIGHT"),
    ("GPIO8", 13, "BTN_C"), ("GPIO9", 14, "BTN_HOME"), ("GPIO10", 15, "BTN_A"),
    ("GPIO11", 16, "SPI_MOSI"), ("GPIO12", 17, "SPI_SCK"), ("GPIO13", 18, "BTN_B"),
    ("GPIO14", 19, "LCD_CS"), ("VDD3P3_RTC", 20, "+3V3"),
    ("GPIO15/XTAL32P", 21, "LCD_DC"), ("GPIO16/XTAL32N", 22, "LCD_RST"),
    ("GPIO17", 23, "LCD_BL"), ("GPIO18", 24, "IR_RX"),
    ("GPIO19/USB_D-", 25, "USB_D-"), ("GPIO20/USB_D+", 26, "USB_D+"),
    ("GPIO21", 27, "TOUCH_1"), ("SPICS1", 28, "PSRAM_CS_INT"),
    ("VDD_SPI", 29, "+3V3_FLASH"), ("SPIHD", 30, "FLASH_IO3"),
    ("SPIWP", 31, "FLASH_IO2"), ("SPICS0", 32, "FLASH_CS"),
    ("SPICLK", 33, "FLASH_CLK"), ("SPIQ", 34, "FLASH_IO1"),
    ("SPID", 35, "FLASH_IO0"), ("SPICLK_N/GPIO48", 36, "STATUS_LED"),
    ("SPICLK_P/GPIO47", 37, "I2C_SCL"), ("GPIO33/PSRAM_D4", 38, "PSRAM_D4_INT"),
    ("GPIO34/PSRAM_D5", 39, "PSRAM_D5_INT"), ("GPIO35/PSRAM_D6", 40, "PSRAM_D6_INT"),
    ("GPIO36/PSRAM_D7", 41, "PSRAM_D7_INT"), ("GPIO37/PSRAM_DQS", 42, "PSRAM_DQS_INT"),
    ("GPIO38", 43, "LED_TL"), ("GPIO39/MTCK", 44, "LED_TR"),
    ("GPIO40/MTDO", 45, "LED_BL"), ("VDD3P3_CPU", 46, "+3V3"),
    ("GPIO41/MTDI", 47, "LED_BR"), ("GPIO42/MTMS", 48, "I2C_SDA"),
    ("GPIO43/U0TXD", 49, "SD_CS"), ("GPIO44/U0RXD", 50, "SD_MISO"),
    ("GPIO45 strap", 51, "STRAP45"), ("GPIO46 strap", 52, "STRAP46"),
    ("XTAL_N", 53, "XTAL_N"), ("XTAL_P", 54, "XTAL_P"),
    ("VDDA", 55, "+3V3A"), ("VDDA", 56, "+3V3A"), ("EP/GND", 57, "GND"),
]


CORE = [
    component("U1", "ESP32-S3R8", "Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm_EP4x4mm_ThermalVias", MCU_PINS, 150, 115,
              "Dual LX7 SoC with in-package 8 MB octal PSRAM"),
    component("U2", "W25Q128JVSIQ 16MB", "Package_SO:SOIC-8_5.3x5.3mm_P1.27mm",
              [("CS#", 1, "FLASH_CS"), ("DO/IO1", 2, "FLASH_IO1"), ("WP#/IO2", 3, "FLASH_IO2"),
               ("GND", 4, "GND"), ("DI/IO0", 5, "FLASH_IO0"), ("CLK", 6, "FLASH_CLK"),
               ("HOLD#/IO3", 7, "FLASH_IO3"), ("VCC", 8, "+3V3_FLASH")], 260, 55,
              "External 3.3 V quad-SPI firmware flash"),
    component("Y1", "40MHz 10pF", "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
              [("X1", 1, "XTAL_P"), ("GND", 2, "GND"), ("X2", 3, "XTAL_N"), ("GND", 4, "GND")], 45, 48),
    p2("C1", "12pF", C0402, "XTAL_P", "GND", 42, 82),
    p2("C2", "12pF", C0402, "XTAL_N", "GND", 92, 82),
    p2("R1", "10k", R0402, "+3V3", "EN", 42, 116),
    p2("C3", "1uF", C0603, "EN", "GND", 92, 116),
    p2("SW1", "RESET", "Button_Switch_SMD:SW_SPST_TL3342", "EN", "GND", 42, 144),
    p2("R2", "10k", R0402, "+3V3", "BOOT", 42, 174),
    p2("SW2", "BOOT", "Button_Switch_SMD:SW_SPST_TL3342", "BOOT", "GND", 92, 174),
    p2("L1", "2.0nH RF", "Inductor_SMD:L_0402_1005Metric", "RF_ANT", "RF_MATCH", 245, 125),
    p2("C4", "DNP RF tune", C0402, "RF_MATCH", "GND", 295, 125),
    component("ANT1", "2.4GHz chip antenna", "RF_Antenna:Johanson_2450AT18x100",
              [("FEED", 1, "RF_MATCH"), ("NC", 2, "ANT_NC"), ("GND", 3, "GND")], 270, 165),
]
for i, value in enumerate(("10uF", "1uF", "100nF", "100nF", "100nF", "100nF"), 5):
    CORE.append(p2(f"C{i}", value, C0603 if value != "100nF" else C0402,
                   "+3V3" if i != 6 else "+3V3A", "GND", 205 + ((i - 5) % 3) * 40,
                   215 + ((i - 5) // 3) * 28))
CORE += [
    p2("FB1", "600R@100MHz >=500mA", "Inductor_SMD:L_0603_1608Metric", "+3V3", "+3V3A", 165, 270,
       "Ferrite bead feeding the ESP32 analog/RF rail"),
    p2("C11", "1uF", C0603, "+3V3_FLASH", "GND", 210, 270),
    p2("C12", "100nF", C0402, "+3V3_FLASH", "GND", 255, 270),
]


POWER = [
    component("J1", "USB-C USB2 device", "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
              [("VBUS", "A4/B4/A9/B9", "VBUS_5V"), ("D-", "A7/B7", "USB_CONN_D-"),
               ("D+", "A6/B6", "USB_CONN_D+"), ("CC1", "A5", "USB_CC1"),
               ("CC2", "B5", "USB_CC2"), ("GND", "A1/B1/A12/B12", "GND"), ("SHIELD", "S", "CHASSIS")], 42, 72),
    p2("R10", "5.1k", R0402, "USB_CC1", "GND", 95, 42),
    p2("R11", "5.1k", R0402, "USB_CC2", "GND", 95, 70),
    component("U3", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6",
              [("D- in", 1, "USB_CONN_D-"), ("GND", 2, "GND"), ("D+ in", 3, "USB_CONN_D+"),
               ("D+ out", 4, "USB_ESD_D+"), ("VBUS", 5, "VBUS_5V"), ("D- out", 6, "USB_ESD_D-")], 150, 54),
    p2("R12", "22R", R0402, "USB_ESD_D-", "USB_D-", 205, 42),
    p2("R13", "22R", R0402, "USB_ESD_D+", "USB_D+", 205, 70),
    component("U4", "BQ24074RGT", "Package_DFN_QFN:VQFN-16-1EP_3x3mm_P0.5mm_EP1.68x1.68mm_ThermalVias",
              [("IN", 13, "VBUS_5V"), ("OUT", "10/11", "VSYS"), ("BAT", "2/3", "VBAT"),
               ("ISET", 16, "CHG_ISET"), ("ILIM", 12, "USB_ILIM"), ("TS", 1, "BAT_NTC"),
               ("CE#", 4, "GND"), ("EN2", 5, "VSYS"), ("EN1", 6, "GND"),
               ("PG#", 7, "CHG_PG"), ("VSS/EP", "8/17", "GND"), ("CHG#", 9, "CHG_STAT"),
               ("TMR", 14, "CHG_TMR"), ("ITERM", 15, "CHG_ITERM")], 95, 145,
              "1-cell Li-ion charger with power path"),
    p2("R14", "1.8k (about 500mA)", R0402, "CHG_ISET", "GND", 42, 205),
    p2("R15", "2.0k (about 800mA)", R0402, "USB_ILIM", "GND", 95, 205),
    component("J2", "LiPo JST-PH 3-pin", "Connector_JST:JST_PH_S3B-PH-K_1x03_P2.00mm_Horizontal",
              [("BAT+", 1, "VBAT"), ("NTC", 2, "BAT_NTC"), ("BAT-", 3, "GND")], 42, 150),
    p2("R16", "DNP 10k NTC fallback", R0402, "BAT_NTC", "GND", 42, 248,
       "Populate only for a 2-wire battery without its own 10k NTC"),
    component("SW3", "MAIN POWER", "Button_Switch_SMD:SW_SPDT_CK_JS102011SAQN",
              [("COM", 2, "VSYS"), ("ON", 1, "VSYS_SW"), ("NC", 3, "POWER_SWITCH_NC")], 155, 145),
    component("U5", "TPS63031 3V3", "Package_SON:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_ThermalVias",
              [("VIN", 8, "VSYS_SW"), ("VINA", 9, "VSYS_SW"), ("L1", 7, "BUCK_L1"),
               ("L2", 5, "BUCK_L2"), ("VOUT", 2, "+3V3"), ("EN", 10, "VSYS_SW"),
               ("PS/SYNC", 1, "GND"), ("GND/EP", "3/11", "GND")], 230, 145),
    p2("L2", "1.5uH >=1.5A", "Inductor_SMD:L_1210_3225Metric", "BUCK_L1", "BUCK_L2", 285, 115),
    p2("C20", "10uF", "Capacitor_SMD:C_0805_2012Metric", "VSYS_SW", "GND", 285, 150),
    p2("C21", "10uF", "Capacitor_SMD:C_0805_2012Metric", "+3V3", "GND", 285, 180),
    p2("R17", "100k", R0402, "VBAT", "VBAT_SENSE", 155, 225),
    p2("R18", "100k", R0402, "VBAT_SENSE", "GND", 205, 225),
    p2("C22", "100nF", C0402, "VBAT_SENSE", "GND", 235, 225),
    p2("R19", "1M shield bleed", R0402, "CHASSIS", "GND", 320, 42),
    p2("C23", "1nF shield HF", C0402, "CHASSIS", "GND", 320, 75),
    p2("R23", "2.2k", R0402, "+3V3", "CHG_PG_LED_A", 320, 115),
    p2("D20", "green power-good", "LED_SMD:LED_0603_1608Metric", "CHG_PG_LED_A", "CHG_PG", 320, 150),
    p2("R24", "2.2k", R0402, "+3V3", "CHG_STAT_LED_A", 320, 190),
    p2("D21", "amber charging", "LED_SMD:LED_0603_1608Metric", "CHG_STAT_LED_A", "CHG_STAT", 320, 225),
    p2("R22", "46.4k 1% (6.25h)", R0402, "CHG_TMR", "GND", 155, 270),
    p2("R25", "3.0k 1% (about 50mA)", R0402, "CHG_ITERM", "GND", 205, 270),
    p2("C24", "1uF 16V", C0603, "VBUS_5V", "GND", 240, 270),
    p2("C25", "4.7uF 10V", C0603, "VSYS", "GND", 265, 225),
    p2("C26", "4.7uF 10V", C0603, "VBAT", "GND", 275, 270),
    p2("C28", "10uF", "Capacitor_SMD:C_0805_2012Metric", "+3V3", "GND", 355, 180),
]


DISPLAY = [
    component("U6", "TPS61023 5V boost", "Package_SON:WSON-6_1.5x1.5mm_P0.5mm",
              [("VIN", 6, "VSYS"), ("SW", 5, "LCD_BOOST_SW"), ("VOUT", 4, "LCD_5V"),
               ("FB", 3, "LCD_FB"), ("EN", 1, "VSYS"), ("GND", 2, "GND")], 48, 65),
    p2("L3", "1uH >=2A", "Inductor_SMD:L_1210_3225Metric", "VSYS", "LCD_BOOST_SW", 105, 45),
    p2("R20", "910k 1%", R0402, "LCD_5V", "LCD_FB", 105, 72),
    p2("R21", "100k 1%", R0402, "LCD_FB", "GND", 155, 72),
    p2("C30", "10uF", "Capacitor_SMD:C_0805_2012Metric", "VSYS", "GND", 105, 100),
    p2("C31", "22uF 10V", "Capacitor_SMD:C_0805_2012Metric", "LCD_5V", "GND", 155, 100),
    p2("C32", "22uF 10V", "Capacitor_SMD:C_0805_2012Metric", "LCD_5V", "GND", 205, 100),
    component("J3", "ST7789 320x240 module", "Connector_PinSocket_2.54mm:PinSocket_1x08_P2.54mm_Vertical",
              [("VCC", 1, "LCD_5V"), ("GND", 2, "GND"), ("BL/EN", 3, "LCD_BL"),
               ("DC", 4, "LCD_DC"), ("SCK/SCL", 5, "SPI_SCK"), ("MOSI/SDA", 6, "SPI_MOSI"),
               ("CS", 7, "LCD_CS"), ("RST", 8, "LCD_RST")], 245, 65),
]
button_names = (("UP", "BTN_UP"), ("DOWN", "BTN_DOWN"), ("LEFT", "BTN_LEFT"),
                ("RIGHT", "BTN_RIGHT"), ("A", "BTN_A"), ("B", "BTN_B"),
                ("C", "BTN_C"), ("HOME", "BTN_HOME"))
for i, (label, net) in enumerate(button_names, 1):
    DISPLAY.append(p2(f"SW{10+i}", label, "Button_Switch_SMD:SW_SPST_TL3342", net, "GND",
                      42 + ((i - 1) % 4) * 72, 155 + ((i - 1) // 4) * 42))
for i, net in enumerate(("LED_TL", "LED_TR", "LED_BL", "LED_BR"), 1):
    DISPLAY.append(p2(f"R{30+i}", "470R LED", R0402, net, f"LED{i}_A", 42 + (i - 1) * 72, 238))
    DISPLAY.append(p2(f"D{i}", "corner LED", "LED_SMD:LED_0603_1608Metric", f"LED{i}_A", "GND", 42 + (i - 1) * 72, 270))


PERIPHERALS = [
    component("U7", "MPU-6050", "Sensor_Motion:InvenSense_QFN-24_4x4mm_P0.5mm",
              [("VDD", 13, "+3V3"), ("VLOGIC", 8, "+3V3"), ("GND", "9/11/18", "GND"),
               ("SDA", 24, "I2C_SDA"), ("SCL", 23, "I2C_SCL"), ("INT", 12, "IMU_INT"),
               ("AD0", 9, "GND"), ("REGOUT", 10, "IMU_REGOUT"), ("CPOUT", 20, "IMU_CPOUT")], 55, 66),
    p2("R40", "4.7k", R0402, "I2C_SDA", "+3V3", 110, 42),
    p2("R41", "4.7k", R0402, "I2C_SCL", "+3V3", 160, 42),
    p2("C40", "100nF", C0402, "IMU_REGOUT", "GND", 110, 75),
    p2("C41", "2.2nF", C0402, "IMU_CPOUT", "GND", 160, 75),
    component("U8", "TSOP38238", "OptoDevice:Vishay_MINICAST-3Pin",
              [("OUT", 1, "IR_RX"), ("GND", 2, "GND"), ("VS", 3, "IR_RX_VCC")], 55, 145),
    p2("R42", "100R", R0402, "+3V3", "IR_RX_VCC", 110, 130),
    p2("C42", "4.7uF", C0603, "IR_RX_VCC", "GND", 160, 130),
    p2("R43", "1k", R0402, "IR_TX", "IR_BASE", 110, 175),
    p2("R44", "100k", R0402, "IR_BASE", "GND", 160, 175),
    component("Q1", "MMBT2222A", "Package_TO_SOT_SMD:SOT-23",
              [("B", 1, "IR_BASE"), ("E", 2, "GND"), ("C", 3, "IR_LED_K")], 225, 155),
    p2("D10", "940nm IR LED", "LED_SMD:LED_1206_3216Metric", "IR_LED_A", "IR_LED_K", 285, 140),
    p2("R45", "47R pulse limit", "Resistor_SMD:R_0805_2012Metric", "VSYS", "IR_LED_A", 285, 175),
    component("U9", "WS2812B-2020", "LED_SMD:LED_WS2812B-2020_PLCC4_2.0x2.0mm",
              [("VDD", 1, "+3V3"), ("DOUT", 2, "STATUS_DOUT"), ("VSS", 3, "GND"), ("DIN", 4, "STATUS_DIN")], 55, 235),
    p2("R46", "330R", R0402, "STATUS_LED", "STATUS_DIN", 110, 220),
    p2("C43", "100nF", C0402, "+3V3", "GND", 160, 220),
    component("J4", "MicroSD SPI", "Connector_Card:microSD_HC_Hirose_DM3D-SF",
              [("DAT2", 1, "SD_DAT2_NC"), ("CS/DAT3", 2, "SD_CS"), ("MOSI/CMD", 3, "SPI_MOSI"),
               ("VDD", 4, "+3V3"), ("SCK", 5, "SPI_SCK"), ("GND", 6, "GND"),
               ("MISO/DAT0", 7, "SD_MISO"), ("DAT1", 8, "SD_DAT1_NC"), ("SHIELD", "S", "GND")], 250, 65),
    p2("R47", "10k", R0402, "SD_CS", "+3V3", 210, 115),
    p2("R48", "10k", R0402, "SD_MISO", "+3V3", 260, 150),
    component("J5", "I2C / accessory", "Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
              [("3V3", 1, "+3V3"), ("GND", 2, "GND"), ("SDA", 3, "I2C_SDA"),
               ("SCL", 4, "I2C_SCL"), ("GPIO21", 5, "TOUCH_1"), ("VSYS", 6, "VSYS")], 250, 210),
    p2("R49", "1M touch discharge", R0402, "TOUCH_1", "GND", 285, 260),
]


PAGES = [
    ("core_compute", "Oreo badge — ESP32-S3R8 core, flash, clock and RF", CORE,
     [("BARE ESP32-S3R8 CORE", 18, 18, 2.0, True),
      ("GPIO33–GPIO37 are bonded to in-package octal PSRAM and are not available.", 18, 25, 1.15, False),
      ("RF values are starting values only; antenna matching requires a VNA on the final PCB.", 18, 285, 1.05, False)]),
    ("power_usb", "Oreo badge — USB-C, Li-ion charger and regulated rails", POWER,
     [("USB-C + LI-ION POWER PATH", 18, 18, 2.0, True),
      ("BQ24074 permits charging while the badge runs; SW3 disconnects the system but leaves charging active.", 18, 25, 1.1, False),
      ("Verify charge current against the selected cell rating before assembly.", 18, 285, 1.05, False)]),
    ("display_controls", "Oreo badge — display supply, ST7789 and controls", DISPLAY,
     [("DISPLAY + HUMAN INTERFACE", 18, 18, 2.0, True),
      ("The dedicated 5 V boost preserves the tested SmartElex module operating point on battery power.", 18, 25, 1.1, False),
      ("Buttons are active-low; OreoOS performs IRQ-assisted software debounce.", 18, 285, 1.05, False)]),
    ("peripherals_expansion", "Oreo badge — motion, infrared, LEDs, microSD and expansion", PERIPHERALS,
     [("SENSORS + MEDIA EXPANSION", 18, 18, 2.0, True),
      ("microSD shares GPIO11/12 with the LCD and uses independent GPIO43 CS / GPIO44 MISO.", 18, 25, 1.1, False),
      ("GPIO45/46 are intentionally unassigned because they are boot strapping pins.", 18, 285, 1.05, False)]),
]


SOURCING = {
    "U1": ("Espressif Systems", "ESP32-S3R8", "Active", "Core device; 3.3 V octal PSRAM in package"),
    "U2": ("Winbond", "W25Q128JVSIQ", "Active", "16 MB, 3.3 V, 80 MHz quad-SPI"),
    "Y1": ("Abracon", "ABM8-40.000MHZ-B2-T", "Verify CL", "Recalculate C1/C2 from measured PCB stray capacitance"),
    "ANT1": ("Johanson Technology", "2450AT18B100E", "Tune on PCB", "Keep pi-network provisions and validate with VNA"),
    "J1": ("GCT", "USB4105-GF-A", "Active", "USB 2.0 Type-C receptacle"),
    "U3": ("STMicroelectronics", "USBLC6-2SC6", "Active", "USB ESD array"),
    "U4": ("Texas Instruments", "BQ24074RGTR", "Active", "Power-path single-cell Li-ion charger"),
    "SW3": ("C&K", "JS102011SAQN", "Active", "Main system disconnect; charger remains connected"),
    "U5": ("Texas Instruments", "TPS63031DSKR", "Active", "Fixed 3.3 V buck-boost"),
    "L2": ("Murata", "LQH32PN1R5NN0L", "Verify current", "1.5 uH shielded power inductor"),
    "U6": ("Texas Instruments", "TPS61023DRLR", "Active", "Adjustable synchronous boost for LCD 5 V"),
    "L3": ("Murata", "LQH32PN1R0NN0L", "Verify current", "1.0 uH shielded power inductor"),
    "J3": ("Samtec", "SSQ-108-03-T-S", "Mechanical check", "Confirm mating orientation against chosen ST7789 module"),
    "U7": ("TDK InvenSense", "MPU-6050", "Sourcing risk", "Firmware-compatible; buy only traceable stock or qualify a successor"),
    "U8": ("Vishay", "TSOP38238", "Active", "38 kHz demodulating IR receiver"),
    "Q1": ("onsemi", "MMBT2222ALT1G", "Active", "IR LED pulse driver"),
    "D10": ("Vishay", "VSMY2940GX01", "Active", "940 nm high-intensity IR emitter; verify footprint"),
    "U9": ("Worldsemi", "WS2812B-2020", "Verify source", "3.3 V operation to be checked on prototypes"),
    "J4": ("Hirose", "DM3D-SF", "Lifecycle check", "Push-push microSD connector"),
    "J2": ("JST", "S3B-PH-K-S(LF)(SN)", "Active", "3-pin battery/NTC connector; confirm pack polarity"),
}


def sourcing_for(comp):
    if comp["ref"] in SOURCING:
        return SOURCING[comp["ref"]]
    prefix = ''.join(ch for ch in comp["ref"] if ch.isalpha())
    if prefix in ("R", "C"):
        return ("Qualified commodity", "", "Select by rating",
                "Use 1% resistors; X7R capacitors with voltage derating")
    if prefix in ("D", "L", "FB"):
        return ("Qualified commodity", "", "Select by rating", "Confirm current, power and package")
    if prefix == "SW":
        return ("E-Switch / C&K equivalent", "", "Mechanical check", "Confirm actuator height and force")
    return ("TBD", "", "Select", "Confirm availability and mechanical fit")


def root_schematic():
    root = uid("elixporoot")
    rows = ['(kicad_sch', '  (version 20250114)', '  (generator "oreo_badge_generator")',
            '  (generator_version "1.0")', f'  (uuid "{root}")', '  (paper "A3")',
            '  (title_block (title "Oreo badge complete hardware") (rev "0.1")',
            '    (company "OreoOS open hardware badge"))', '  (lib_symbols)',
            '  ' + note("root", 1, "OREO BADGE — COMPLETE HARDWARE", 25, 25, 2.5, True),
            '  ' + note("root", 2, "ESP32-S3R8 bare-chip design / 16 MB flash / 8 MB in-package PSRAM", 25, 34, 1.35),
            '  ' + note("root", 3, "Open each sheet for component-level wiring and assigned footprints.", 25, 42, 1.15)]
    positions = ((35, 65), (175, 65), (35, 155), (175, 155))
    for page_no, ((name, title, _components, _notes), (x, y)) in enumerate(zip(PAGES, positions), 2):
        sid = uid(name + "sheet")
        rows += ['  (sheet', f'    (at {x} {y})', '    (size 110 60)',
                 '    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)',
                 '    (stroke (width 0.4) (type solid))', '    (fill (color 245 230 220 1))',
                 f'    (uuid "{sid}")',
                 f'    (property "Sheetname" "{title}" (at {x} {y - 1} 0) {fx(1.15, justify="left bottom", bold=True)})',
                 f'    (property "Sheetfile" "{name}.kicad_sch" (at {x} {y + 61} 0) {fx(1.0, justify="left top")})',
                 '    (instances', f'      (project "{PROJECT}"',
                 f'        (path "/{sid}" (page "{page_no}")))', '    )', '  )']
    rows += ['  (sheet_instances (path "/" (page "1")))', '  (embedded_fonts no)', ')']
    return "\n".join(rows) + "\n"


def write_bom():
    with (OUT / "BOM_PRELIMINARY.csv").open("w", newline="") as stream:
        csv = writer(stream, lineterminator="\n")
        csv.writerow(("Reference", "Value / part", "Footprint", "Sheet", "Design note"))
        for name, _title, components, _notes in PAGES:
            for comp in components:
                csv.writerow((comp["ref"], comp["value"], comp["footprint"], name, comp["note"]))

    with (OUT / "BOM_PROCUREMENT.csv").open("w", newline="") as stream:
        csv = writer(stream, lineterminator="\n")
        csv.writerow(("Reference", "Qty", "Value / function", "Manufacturer",
                      "Manufacturer part", "Footprint", "Populate", "Status", "Notes"))
        for name, _title, components, _notes in PAGES:
            for comp in components:
                manufacturer, mpn, status, sourcing_note = sourcing_for(comp)
                populate = "DNP" if comp["value"].startswith("DNP") else "YES"
                csv.writerow((comp["ref"], 1, comp["value"], manufacturer, mpn,
                              comp["footprint"], populate, status,
                              "; ".join(x for x in (comp["note"], sourcing_note) if x)))
        csv.writerow(("BT1", 1, "Protected 1S LiPo, >=1000mAh, 10k NTC",
                      "Qualified battery vendor", "TBD after enclosure volume",
                      "Off-board / JST-PH 3-wire", "YES", "Safety-critical",
                      "Must include protection PCB; certify cell and verify connector polarity"))


def write_symbol_library():
    definitions = []
    for _name, _title, components, _notes in PAGES:
        for comp in components:
            key = comp["ref"].replace("#", "PWR")
            definition, _pins, _half = symbol_def(key, comp)
            definitions.append(definition.replace(
                f'(symbol "{LIB}:', '(symbol "', 1))
    text = ('(kicad_symbol_lib\n  (version 20251024)\n'
            '  (generator "oreo_badge_generator")\n'
            '  (generator_version "1.0")\n' +
            '\n'.join('  ' + item.replace('\n', '\n  ')
                      for item in definitions) +
            '\n)\n')
    (OUT / "oreo_badge.kicad_sym").write_text(text)
    (OUT / "sym-lib-table").write_text(
        '(sym_lib_table\n'
        '  (version 7)\n'
        '  (lib (name "oreo_badge")(type "KiCad")'
        '(uri "${KIPRJMOD}/oreo_badge.kicad_sym")(options "")(descr ""))\n'
        ')\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "elixpo.kicad_sch").write_text(root_schematic())
    for name, title, components, notes in PAGES:
        (OUT / f"{name}.kicad_sch").write_text(
            page(name, title, uid(name + "sheet"), components, notes))
    write_bom()
    write_symbol_library()
    print("Generated Oreo badge schematics and BOM in", OUT)


if __name__ == "__main__":
    main()
