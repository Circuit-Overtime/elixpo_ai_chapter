from pathlib import Path

import pytest

from eeprom28c64.image import (
    EEPROM_SIZE,
    ImageError,
    crc16_ccitt_false,
    load_image,
    make_ihex_record,
)


def test_standard_crc_vector():
    assert crc16_ccitt_false(b"123456789") == 0x29B1


def test_binary_is_filled_to_eeprom_size(tmp_path: Path):
    source = tmp_path / "tiny.bin"
    source.write_bytes(b"\x12\x34")
    image = load_image(source)
    assert len(image.data) == EEPROM_SIZE
    assert image.data[:3] == b"\x12\x34\xFF"
    assert image.source_bytes == 2


def test_ihex_load_and_checksum(tmp_path: Path):
    source = tmp_path / "image.hex"
    source.write_text(
        make_ihex_record(0x0010, 0, b"\xAA\x55") + "\n" + make_ihex_record(0, 1) + "\n",
        encoding="ascii",
    )
    image = load_image(source, fill=0)
    assert image.data[0x10:0x12] == b"\xAA\x55"
    assert image.used_range == "0x0010-0x0011"


def test_oversized_binary_is_rejected(tmp_path: Path):
    source = tmp_path / "large.bin"
    source.write_bytes(bytes(EEPROM_SIZE + 1))
    with pytest.raises(ImageError, match="holds 8192"):
        load_image(source)


def test_bad_ihex_checksum_is_rejected(tmp_path: Path):
    source = tmp_path / "bad.hex"
    source.write_text(":0100000001FF\n:00000001FF\n", encoding="ascii")
    with pytest.raises(ImageError, match="checksum"):
        load_image(source)
