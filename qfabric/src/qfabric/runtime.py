from __future__ import annotations

import platform
import subprocess
from pathlib import Path
from typing import Any

I32_MIN = -(1 << 31)
I32_MAX = (1 << 31) - 1


def parse_add_arguments(arguments: list[str]) -> tuple[int, int]:
    if len(arguments) != 2:
        raise ValueError("add requires exactly two signed 32-bit integer arguments")
    try:
        values = tuple(int(argument, 10) for argument in arguments)
    except ValueError as error:
        raise ValueError("add arguments must be signed 32-bit integers") from error
    if any(value < I32_MIN or value > I32_MAX for value in values):
        raise ValueError("add arguments must be signed 32-bit integers")
    a, b = values
    if not I32_MIN <= a + b <= I32_MAX:
        raise ValueError("add result exceeds the signed 32-bit integer range")
    return a, b


def run_linux(root: Path, a: int, b: int) -> int:
    machine = platform.machine().lower()
    if machine not in {"aarch64", "arm64"}:
        raise RuntimeError(
            f"the Linux artifact targets ARM64 and cannot execute on {machine or 'unknown'}"
        )
    artifact = root / "build/stage2/linux/qf-add-linux"
    if not artifact.is_file():
        raise RuntimeError(f"Linux artifact is missing: {artifact}; run 'qf build' first")
    completed = subprocess.run(
        [str(artifact), str(a), str(b)],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or f"native runner exited {completed.returncode}"
        raise RuntimeError(detail)
    try:
        return int(completed.stdout.strip(), 10)
    except ValueError as error:
        raise RuntimeError("Linux artifact returned an invalid result") from error


def _connect_bridge(address: str):
    try:
        from arduino.router_bridge import Bridge
    except ImportError as error:
        raise RuntimeError("arduino-router-bridge is not installed") from error
    bridge = Bridge(address=address)
    if not bridge.connect(timeout=5):
        bridge.disconnect()
        raise RuntimeError(f"could not connect to Arduino Router at {address}")
    return bridge


def run_rt(address: str, a: int, b: int, *, timeout: float) -> int:
    bridge: Any = _connect_bridge(address)
    try:
        result = bridge.call("qf_qtask_add", a, b, timeout=timeout)
    finally:
        bridge.disconnect()
    if not isinstance(result, int) or isinstance(result, bool) or not I32_MIN <= result <= I32_MAX:
        raise RuntimeError(f"RT artifact returned an invalid result: {result!r}")
    return result
