from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

EEPROM_SIZE = 8192


class ImageError(ValueError):
    """The selected image cannot safely be programmed."""


def crc16_ccitt_false(data: bytes) -> int:
    crc = 0xFFFF
    for value in data:
        crc ^= value << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def make_ihex_record(address: int, record_type: int, data: bytes = b"") -> str:
    if len(data) > 255:
        raise ValueError("Intel HEX records are limited to 255 bytes")
    raw = bytes((len(data), address >> 8, address & 0xFF, record_type)) + data
    checksum = (-sum(raw)) & 0xFF
    return ":" + (raw + bytes((checksum,))).hex().upper()


@dataclass(frozen=True)
class MemoryImage:
    data: bytes
    source_bytes: int
    lowest_address: int
    highest_address: int
    source_format: str

    @property
    def crc(self) -> int:
        return crc16_ccitt_false(self.data)

    @property
    def used_range(self) -> str:
        if self.source_bytes == 0:
            return "empty"
        return f"0x{self.lowest_address:04X}-0x{self.highest_address:04X}"

    def records(self, record_size: int = 32):
        for address in range(0, EEPROM_SIZE, record_size):
            yield address, self.data[address : address + record_size], make_ihex_record(
                address, 0x00, self.data[address : address + record_size]
            )

    def as_ihex(self, record_size: int = 32) -> str:
        lines = [record for _, _, record in self.records(record_size)]
        lines.append(make_ihex_record(0, 0x01))
        return "\n".join(lines) + "\n"


def _load_binary(path: Path, fill: int) -> MemoryImage:
    payload = path.read_bytes()
    if len(payload) > EEPROM_SIZE:
        raise ImageError(f"binary is {len(payload)} bytes; the 28C64 holds {EEPROM_SIZE}")
    image = payload + bytes((fill,)) * (EEPROM_SIZE - len(payload))
    highest = len(payload) - 1 if payload else 0
    return MemoryImage(image, len(payload), 0, highest, "binary")


def _load_ihex(path: Path, fill: int) -> MemoryImage:
    memory = bytearray((fill,)) * EEPROM_SIZE
    touched: dict[int, int] = {}
    base = 0
    saw_eof = False

    for line_number, source_line in enumerate(path.read_text(encoding="ascii").splitlines(), 1):
        line = source_line.strip()
        if not line:
            continue
        if not line.startswith(":"):
            raise ImageError(f"line {line_number}: Intel HEX record must begin with ':'")
        try:
            record = bytes.fromhex(line[1:])
        except ValueError as exc:
            raise ImageError(f"line {line_number}: invalid hexadecimal text") from exc
        if len(record) < 5 or len(record) != record[0] + 5:
            raise ImageError(f"line {line_number}: incorrect record length")
        if sum(record) & 0xFF:
            raise ImageError(f"line {line_number}: checksum mismatch")

        length = record[0]
        offset = (record[1] << 8) | record[2]
        kind = record[3]
        payload = record[4 : 4 + length]

        if kind == 0x00:
            absolute = base + offset
            if absolute + length > EEPROM_SIZE:
                raise ImageError(
                    f"line {line_number}: data reaches 0x{absolute + length - 1:04X}; "
                    "the last 28C64 address is 0x1FFF"
                )
            for index, value in enumerate(payload):
                address = absolute + index
                previous = touched.get(address)
                if previous is not None and previous != value:
                    raise ImageError(f"line {line_number}: conflicting data at 0x{address:04X}")
                touched[address] = value
                memory[address] = value
        elif kind == 0x01:
            if length != 0:
                raise ImageError(f"line {line_number}: malformed EOF record")
            saw_eof = True
            break
        elif kind == 0x02:
            if length != 2:
                raise ImageError(f"line {line_number}: malformed segment-address record")
            base = int.from_bytes(payload, "big") << 4
        elif kind == 0x04:
            if length != 2:
                raise ImageError(f"line {line_number}: malformed linear-address record")
            base = int.from_bytes(payload, "big") << 16
        elif kind in (0x03, 0x05):
            continue
        else:
            raise ImageError(f"line {line_number}: unsupported record type {kind:02X}")

    if not saw_eof:
        raise ImageError("Intel HEX file has no EOF record")
    if not touched:
        raise ImageError("Intel HEX file contains no data")
    addresses = touched.keys()
    return MemoryImage(
        bytes(memory), len(touched), min(addresses), max(addresses), "Intel HEX"
    )


def load_image(filename: str | Path, fill: int = 0xFF) -> MemoryImage:
    path = Path(filename)
    if not path.is_file():
        raise ImageError(f"file not found: {path}")
    if not 0 <= fill <= 0xFF:
        raise ImageError("fill byte must be between 00 and FF")
    if path.suffix.lower() in {".hex", ".ihx", ".ihex"}:
        return _load_ihex(path, fill)
    return _load_binary(path, fill)
