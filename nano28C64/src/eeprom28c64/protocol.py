from __future__ import annotations

import re
import time
from collections.abc import Callable

import serial

from .image import EEPROM_SIZE, MemoryImage

Progress = Callable[[int], None]
READY_MARKER = "28C64 programmer v10 ready"
ROW_PATTERN = re.compile(r"^([0-9A-Fa-f]{4}):\s+((?:[0-9A-Fa-f]{2}\s*)+)$")


class ProgrammerError(RuntimeError):
    pass


class Programmer:
    def __init__(self, port: str, baudrate: int = 115200, timeout: float = 1.0):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial: serial.Serial | None = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()

    def open(self) -> None:
        try:
            self.serial = serial.Serial(
                self.port,
                self.baudrate,
                timeout=0.2,
                write_timeout=3,
                exclusive=True,
            )
        except (OSError, serial.SerialException) as exc:
            raise ProgrammerError(f"cannot open {self.port}: {exc}") from exc
        self.serial.reset_input_buffer()
        deadline = time.monotonic() + 4
        seen: list[str] = []
        while time.monotonic() < deadline:
            line = self._readline()
            if line:
                seen.append(line)
                if READY_MARKER in line:
                    return
        detail = f" Last response: {seen[-1]}" if seen else ""
        raise ProgrammerError(f"v10 firmware did not answer on {self.port}.{detail}")

    def close(self) -> None:
        if self.serial is not None:
            self.serial.close()
            self.serial = None

    def _readline(self) -> str:
        if self.serial is None:
            raise ProgrammerError("serial port is not open")
        return self.serial.readline().decode("ascii", errors="ignore").strip()

    def _write_line(self, line: str) -> None:
        if self.serial is None:
            raise ProgrammerError("serial port is not open")
        self.serial.write(line.encode("ascii") + b"\n")
        self.serial.flush()

    def _wait_line(self, predicate, timeout: float, operation: str) -> str:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            line = self._readline()
            if not line:
                continue
            if line.startswith("ERR"):
                raise ProgrammerError(line)
            if predicate(line):
                return line
        raise ProgrammerError(f"timed out while {operation}")

    def program(self, image: MemoryImage, progress: Progress) -> str:
        self._write_line("I")
        self._wait_line(lambda line: line == "READY for Intel HEX", 3, "starting HEX mode")
        for address, payload, record in image.records(32):
            self._write_line(record)
            expected = f"OK {address:04X}-{address + len(payload) - 1:04X}"
            self._wait_line(lambda line, expected=expected: line == expected, 8, "programming")
            progress(len(payload))
        self._write_line(":00000001FF")
        return self._wait_line(
            lambda line: line.startswith("OK EOF; programmed and verified"),
            5,
            "finishing programming",
        )

    def read_all(self, progress: Progress) -> bytes:
        self._write_line("R 0000 2000")
        memory = bytearray(EEPROM_SIZE)
        received = 0
        deadline = time.monotonic() + 20
        while received < EEPROM_SIZE and time.monotonic() < deadline:
            line = self._readline()
            if not line:
                continue
            match = ROW_PATTERN.match(line)
            if not match:
                if line.startswith("ERR"):
                    raise ProgrammerError(line)
                continue
            address = int(match.group(1), 16)
            payload = bytes.fromhex(match.group(2))
            if address != received:
                raise ProgrammerError(
                    f"unexpected dump address 0x{address:04X}; expected 0x{received:04X}"
                )
            memory[address : address + len(payload)] = payload
            received += len(payload)
            progress(len(payload))
        if received != EEPROM_SIZE:
            raise ProgrammerError(f"dump stopped after {received} of {EEPROM_SIZE} bytes")
        return bytes(memory)
