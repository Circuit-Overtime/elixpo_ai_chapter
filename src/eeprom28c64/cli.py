from __future__ import annotations

import argparse
import sys
from pathlib import Path

from serial.tools import list_ports
from tqdm import tqdm

from . import __version__
from .image import EEPROM_SIZE, ImageError, MemoryImage, crc16_ccitt_false, load_image
from .protocol import Programmer, ProgrammerError


def hex_byte(value: str) -> int:
    try:
        parsed = int(value, 16)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a hexadecimal byte") from exc
    if not 0 <= parsed <= 0xFF:
        raise argparse.ArgumentTypeError("must be between 00 and FF")
    return parsed


def programmer_ports():
    """Prefer USB serial adapters and hide unused motherboard UART entries."""
    ports = list(list_ports.comports())
    usb_ports = [
        port
        for port in ports
        if port.vid is not None
        or port.device.startswith(("/dev/ttyUSB", "/dev/ttyACM", "/dev/cu.usb"))
    ]
    if usb_ports:
        return usb_ports
    # Keep Windows COM ports and unusual adapters, but do not present dormant
    # Linux motherboard UARTs as EEPROM programmers.
    return [port for port in ports if not port.device.startswith("/dev/ttyS")]


def choose_port(requested: str | None) -> str:
    if requested:
        return requested
    ports = programmer_ports()
    if len(ports) == 1:
        return ports[0].device
    if not ports:
        raise ProgrammerError("no serial programmer found; connect it or pass --port")
    names = ", ".join(port.device for port in ports)
    raise ProgrammerError(f"more than one serial port found ({names}); pass --port")


def show_image(image: MemoryImage, path: Path) -> None:
    print(f"File:       {path}")
    print(f"Format:     {image.source_format}")
    print(f"Input data: {image.source_bytes} bytes at {image.used_range}")
    print(f"EEPROM:     {EEPROM_SIZE} bytes (unused space filled before programming)")
    print(f"CRC-16:     {image.crc:04X}")


def read_device(programmer: Programmer, description: str) -> bytes:
    with tqdm(total=EEPROM_SIZE, unit="B", unit_scale=True, desc=description) as bar:
        return programmer.read_all(bar.update)


def compare_image(expected: MemoryImage, actual: bytes) -> None:
    actual_crc = crc16_ccitt_false(actual)
    if actual != expected.data:
        mismatch = next(i for i, pair in enumerate(zip(expected.data, actual)) if pair[0] != pair[1])
        raise ProgrammerError(
            f"verification failed at 0x{mismatch:04X}: expected "
            f"{expected.data[mismatch]:02X}, read {actual[mismatch]:02X}; CRC {actual_crc:04X}"
        )
    print(f"Verified all {EEPROM_SIZE} bytes; CRC-16 {actual_crc:04X} matches.")


def command_ports(_args) -> int:
    ports = programmer_ports()
    if not ports:
        print("No serial ports found.")
        return 1
    for port in ports:
        print(f"{port.device:16} {port.description}")
    return 0


def command_info(args) -> int:
    image = load_image(args.image, args.fill)
    show_image(image, Path(args.image))
    return 0


def command_program(args) -> int:
    image = load_image(args.image, args.fill)
    show_image(image, Path(args.image))
    port = choose_port(args.port)
    print(f"Programmer: {port}")
    with Programmer(port) as programmer:
        with tqdm(total=EEPROM_SIZE, unit="B", unit_scale=True, desc="Programming") as bar:
            programmer.program(image, bar.update)
        actual = read_device(programmer, "Verifying")
    compare_image(image, actual)
    return 0


def command_verify(args) -> int:
    image = load_image(args.image, args.fill)
    show_image(image, Path(args.image))
    with Programmer(choose_port(args.port)) as programmer:
        actual = read_device(programmer, "Reading")
    compare_image(image, actual)
    return 0


def command_dump(args) -> int:
    target = Path(args.output)
    with Programmer(choose_port(args.port)) as programmer:
        data = read_device(programmer, "Reading")
    image = MemoryImage(data, EEPROM_SIZE, 0, EEPROM_SIZE - 1, "EEPROM dump")
    if target.suffix.lower() in {".hex", ".ihx", ".ihex"}:
        target.write_text(image.as_ihex(), encoding="ascii")
    else:
        target.write_bytes(data)
    print(f"Saved {EEPROM_SIZE} bytes to {target}; CRC-16 {image.crc:04X}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="eeprom28c64",
        description="Program, read, and verify a 28C64 EEPROM without using a serial monitor.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("ports", help="list available serial ports").set_defaults(func=command_ports)

    info = subparsers.add_parser("info", help="check an image without connecting hardware")
    info.add_argument("image", help="Intel HEX or raw binary file")
    info.add_argument("--fill", type=hex_byte, default=0xFF, help="fill byte for unused space (default: FF)")
    info.set_defaults(func=command_info)

    for name, help_text, function in (
        ("program", "program and fully verify an image", command_program),
        ("verify", "compare the EEPROM with an image", command_verify),
    ):
        command = subparsers.add_parser(name, help=help_text)
        command.add_argument("image", help="Intel HEX or raw binary file")
        command.add_argument("-p", "--port", help="serial port; auto-detected when only one exists")
        command.add_argument("--fill", type=hex_byte, default=0xFF, help="fill byte for unused space (default: FF)")
        command.set_defaults(func=function)

    dump = subparsers.add_parser("dump", help="save the complete EEPROM to .bin or .hex")
    dump.add_argument("output", help="destination .bin or Intel .hex file")
    dump.add_argument("-p", "--port", help="serial port; auto-detected when only one exists")
    dump.set_defaults(func=command_dump)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        return args.func(args)
    except (ImageError, ProgrammerError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
