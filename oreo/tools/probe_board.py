#!/usr/bin/env python3
"""Collect read-only ESP32-S3 identity and flash metadata with esptool.

The probe never erases, writes, or reads flash contents.  It records the
esptool transcript and a small machine-readable summary for the RV565 paper.
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "paper" / "measurements"
MAC_RE = re.compile(r"(?im)^(\s*(?:Base )?MAC(?: Address)?\s*:\s*)[0-9a-f:-]+\s*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read ESP32-S3/flash metadata without modifying the badge."
    )
    parser.add_argument(
        "--port",
        help="serial device; otherwise detect one /dev/ttyACM* or /dev/ttyUSB*",
    )
    parser.add_argument(
        "--baud",
        type=int,
        default=115200,
        help="ROM-loader baud rate (default: 115200)",
    )
    parser.add_argument(
        "--wait",
        type=float,
        default=90.0,
        help="seconds to wait for the serial device (default: 90)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="measurement destination (default: paper/measurements)",
    )
    parser.add_argument(
        "--python",
        type=Path,
        help="Python interpreter containing esptool; normally auto-detected",
    )
    parser.add_argument(
        "--include-identifiers",
        action="store_true",
        help="retain the unique MAC address in saved output",
    )
    return parser.parse_args()


def available_ports() -> list[str]:
    candidates: list[str] = []
    for pattern in ("/dev/serial/by-id/*", "/dev/ttyACM*", "/dev/ttyUSB*"):
        for name in sorted(glob.glob(pattern)):
            resolved = os.path.realpath(name)
            if resolved not in candidates:
                candidates.append(resolved)
    return candidates


def wait_for_port(requested: str | None, timeout: float) -> str:
    deadline = time.monotonic() + timeout
    announced = False
    while True:
        if requested:
            if Path(requested).exists():
                return os.path.realpath(requested)
        else:
            ports = available_ports()
            if len(ports) == 1:
                return ports[0]
            if len(ports) > 1:
                choices = "\n  ".join(ports)
                raise SystemExit(
                    "More than one serial device is connected. Select one with "
                    f"--port:\n  {choices}"
                )
        if time.monotonic() >= deadline:
            target = requested or "/dev/ttyACM* or /dev/ttyUSB*"
            raise SystemExit(f"Timed out waiting for {target}")
        if not announced:
            target = requested or "an ESP32-S3 serial device"
            print(f"Waiting up to {timeout:g}s for {target} ...", flush=True)
            announced = True
        time.sleep(0.25)


def has_esptool(python: Path) -> bool:
    if not python.exists():
        return False
    try:
        result = subprocess.run(
            [str(python), "-m", "esptool", "version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def find_esptool_python(explicit: Path | None) -> Path:
    if explicit:
        if has_esptool(explicit):
            return explicit.resolve()
        raise SystemExit(f"{explicit} cannot run 'python -m esptool version'")

    candidates = [Path(sys.executable)]
    for variable in ("OREO_ESPTOOL_PYTHON", "IDF_PYTHON_ENV_PATH"):
        value = os.environ.get(variable)
        if value:
            candidate = Path(value)
            candidates.append(candidate / "bin/python" if candidate.is_dir() else candidate)
    candidates.extend(
        Path(name)
        for name in sorted(
            glob.glob(str(Path.home() / ".espressif/python_env/idf*_env/bin/python")),
            reverse=True,
        )
    )

    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve() if candidate.exists() else candidate
        if resolved in seen:
            continue
        seen.add(resolved)
        if has_esptool(candidate):
            return candidate
    raise SystemExit(
        "No Python environment with esptool was found. Source ESP-IDF's "
        "export.sh or pass --python /path/to/idf-env/bin/python."
    )


def redact(text: str, include_identifiers: bool) -> str:
    if include_identifiers:
        return text
    return MAC_RE.sub(r"\1<redacted>", text)


def run_capture(command: list[str], timeout: float = 30.0) -> tuple[int, str]:
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
        return result.returncode, result.stdout
    except subprocess.TimeoutExpired as exc:
        partial = exc.stdout or ""
        if isinstance(partial, bytes):
            partial = partial.decode(errors="replace")
        return 124, partial + f"\nTimed out after {timeout:g}s.\n"


def esptool_command(python: Path, port: str, baud: int, action: str) -> list[str]:
    return [
        str(python),
        "-m",
        "esptool",
        "--chip",
        "esp32s3",
        "--port",
        port,
        "--baud",
        str(baud),
        "--before",
        "default_reset",
        "--after",
        "hard_reset",
        action,
    ]


def first_match(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, flags=re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else None


def parse_summary(transcript: str) -> dict[str, object]:
    chip_line = first_match(r"^Chip is\s+(.+)$", transcript)
    result: dict[str, object] = {
        "chip": chip_line,
        "features": first_match(r"^Features:\s*(.+)$", transcript),
        "crystal": first_match(r"^Crystal is\s+(.+)$", transcript),
        "usb_mode": first_match(r"^USB mode:\s*(.+)$", transcript),
        "mac": first_match(r"^(?:Base )?MAC(?: Address)?\s*:\s*(.+)$", transcript),
        "flash_manufacturer": first_match(r"^Manufacturer:\s*(.+)$", transcript),
        "flash_device": first_match(r"^Device:\s*(.+)$", transcript),
        "flash_size": first_match(r"^Detected flash size:\s*(.+)$", transcript),
        "flash_voltage": first_match(
            r"^Flash voltage set by (?:a strapping pin|eFuse) to\s+(.+)$",
            transcript,
        ),
    }
    return {key: value for key, value in result.items() if value is not None}


def usb_metadata(port: str) -> dict[str, str]:
    code, output = run_capture(
        ["udevadm", "info", "--query=property", f"--name={port}"], timeout=5
    )
    if code != 0:
        return {}
    allowed = {
        "ID_VENDOR",
        "ID_VENDOR_ID",
        "ID_MODEL",
        "ID_MODEL_ID",
        "ID_USB_DRIVER",
    }
    properties: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if separator and key in allowed:
            properties[key] = value
    return properties


def git_revision() -> str | None:
    code, output = run_capture(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], timeout=5
    )
    return output.strip() if code == 0 else None


def main() -> int:
    args = parse_args()
    if args.baud <= 0 or args.wait < 0:
        raise SystemExit("--baud must be positive and --wait cannot be negative")

    python = find_esptool_python(args.python)
    port = wait_for_port(args.port, args.wait)
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / f"board-probe-{stamp}.log"
    json_path = output_dir / f"board-probe-{stamp}.json"

    print(f"Port:     {port}")
    print(f"Python:   {python}")
    print(f"Baud:     {args.baud}")
    print("Probe is read-only: chip_id, flash_id, get_security_info\n")

    sections: list[str] = []
    version_code, version_output = run_capture(
        [str(python), "-m", "esptool", "version"], timeout=8
    )
    sections.append(f"===== esptool version (exit={version_code}) =====\n{version_output}")

    failed = False
    for action in ("chip_id", "flash_id", "get_security_info"):
        print(f"Reading {action} ...", flush=True)
        code, output = run_capture(
            esptool_command(python, port, args.baud, action), timeout=35
        )
        sections.append(f"===== {action} (exit={code}) =====\n{output}")
        print(redact(output, args.include_identifiers).rstrip())
        if code != 0:
            failed = True
            break
        time.sleep(0.75)

    transcript = redact("\n".join(sections), args.include_identifiers)
    metadata: dict[str, object] = {
        "captured_at_utc": now.isoformat(),
        "repository_revision": git_revision(),
        "host": {
            "platform": platform.platform(),
            "python": platform.python_version(),
        },
        "connection": {
            "port": port,
            "baud": args.baud,
            "usb": usb_metadata(port),
        },
        "identifiers_redacted": not args.include_identifiers,
        "observations": parse_summary(transcript),
        "probe_succeeded": not failed,
    }

    log_path.write_text(transcript.rstrip() + "\n", encoding="utf-8")
    json_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"\nTranscript: {log_path}")
    print(f"Summary:    {json_path}")

    if failed:
        print(
            "\nProbe failed. Hold BOOT, tap RESET once, release BOOT, and rerun "
            "the same command.",
            file=sys.stderr,
        )
        return 1
    print("Board probe complete; no flash contents were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
