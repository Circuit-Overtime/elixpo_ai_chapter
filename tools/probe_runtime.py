#!/usr/bin/env python3
"""Capture OreoOS/MicroPython runtime and memory facts over the serial REPL."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "paper" / "measurements"
RESULT_PREFIX = "OREO_RUNTIME_JSON="

DEVICE_PROBE = r'''
import gc
import machine
import os
import sys

try:
    import json
except ImportError:
    import ujson as json

result = {}
result["cpu_hz"] = machine.freq()
result["reset_cause"] = machine.reset_cause()
result["micropython_version"] = sys.version
result["implementation_name"] = sys.implementation.name
result["implementation_version"] = list(sys.implementation.version)
result["platform"] = sys.platform

result["native_modules"] = {}
for module_name, capability in (
    ("_oreo_ir", "poll"),
    ("_oreo_rv565", "inflate_frame"),
):
    try:
        module = __import__(module_name)
        result["native_modules"][module_name] = {
            "available": True,
            capability: hasattr(module, capability),
        }
    except Exception as exc:
        result["native_modules"][module_name] = {
            "available": False,
            "error": repr(exc),
        }

try:
    uname = os.uname()
    result["uname"] = {
        "sysname": uname.sysname,
        "nodename": uname.nodename,
        "release": uname.release,
        "version": uname.version,
        "machine": uname.machine,
    }
except Exception as exc:
    result["uname_error"] = repr(exc)

gc.collect()
result["gc"] = {"allocated_bytes": gc.mem_alloc(), "free_bytes": gc.mem_free()}

try:
    stat = os.statvfs("/")
    result["filesystem"] = {
        "block_size": stat[0],
        "fragment_size": stat[1],
        "blocks_total": stat[2],
        "blocks_free": stat[3],
        "blocks_available": stat[4],
        "bytes_total": stat[1] * stat[2],
        "bytes_free": stat[1] * stat[3],
    }
except Exception as exc:
    result["filesystem_error"] = repr(exc)

try:
    import esp32
    # ESP-IDF MALLOC_CAP_8BIT combined with INTERNAL or SPIRAM.  Each result is
    # a list of (total, free, largest-free-block, minimum-ever-free) regions.
    for name, capabilities in (("internal_8bit", 0x804), ("spiram_8bit", 0x404)):
        try:
            regions = esp32.idf_heap_info(capabilities)
            result[name] = {
                "capabilities": capabilities,
                "region_count": len(regions),
                "total_bytes": sum(region[0] for region in regions),
                "free_bytes": sum(region[1] for region in regions),
                "largest_free_block": max(
                    (region[2] for region in regions), default=0
                ),
                "minimum_free_bytes": sum(region[3] for region in regions),
                "regions": regions,
            }
        except Exception as exc:
            result[name + "_error"] = repr(exc)
except Exception as exc:
    result["esp32_error"] = repr(exc)

print("OREO_RUNTIME_JSON=" + json.dumps(result))
'''


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read OreoOS/MicroPython runtime metadata without writing to the badge."
    )
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--timeout", type=float, default=35.0)
    parser.add_argument(
        "--python",
        type=Path,
        help="Python containing mpremote (default: repository .venv)",
    )
    return parser.parse_args()


def find_python(explicit: Path | None) -> Path:
    candidates = [explicit] if explicit else [
        REPO_ROOT / ".venv/bin/python3",
        REPO_ROOT / ".venv/bin/python",
        Path(sys.executable),
    ]
    for candidate in candidates:
        if candidate is None or not candidate.exists():
            continue
        check = subprocess.run(
            [str(candidate), "-m", "mpremote", "--help"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8,
            check=False,
        )
        if check.returncode == 0:
            # Keep the virtual-environment path. Resolving a venv's Python
            # symlink to /usr/bin/python would discard its installed modules.
            return candidate.absolute()
    raise SystemExit("No Python environment with mpremote was found")


def git_revision() -> str | None:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def configuration_file() -> Path | None:
    candidates = [
        Path.home()
        / "esp/micropython-v1.28/ports/esp32/build-oreoos-s3-v55/sdkconfig",
        REPO_ROOT / "experiments/video_dma/build/sdkconfig",
    ]
    return next((path for path in candidates if path.is_file()), None)


def main() -> int:
    args = parse_args()
    if args.timeout <= 0:
        raise SystemExit("--timeout must be positive")
    python = find_python(args.python)
    if not Path(args.port).exists():
        raise SystemExit(f"serial port does not exist: {args.port}")

    command = [
        str(python),
        "-m",
        "mpremote",
        "connect",
        args.port,
        "exec",
        DEVICE_PROBE,
    ]
    print(f"Reading runtime metadata from {args.port} ...", flush=True)
    try:
        completed = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=args.timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        output = exc.stdout or ""
        if isinstance(output, bytes):
            output = output.decode(errors="replace")
        print(output, end="")
        raise SystemExit(
            "Runtime probe timed out. Close any serial monitor and press RESET once."
        )

    output = completed.stdout
    print(output, end="")
    if completed.returncode != 0:
        raise SystemExit(
            "mpremote could not enter the REPL. Close other serial programs, "
            "press RESET once, and retry."
        )

    result_line = next(
        (line for line in output.splitlines() if line.startswith(RESULT_PREFIX)), None
    )
    if result_line is None:
        raise SystemExit("The badge returned no structured runtime result")
    runtime = json.loads(result_line[len(RESULT_PREFIX) :])

    config = configuration_file()
    record = {
        "probe_schema_version": 2,
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "repository_revision": git_revision(),
        "serial_port": args.port,
        "runtime": runtime,
        "configuration": (
            {"path": str(config), "sha256": file_sha256(config)} if config else None
        ),
    }

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / f"runtime-probe-{stamp}.log"
    json_path = output_dir / f"runtime-probe-{stamp}.json"
    log_path.write_text(output, encoding="utf-8")
    json_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    print(f"Runtime log: {log_path}")
    print(f"Summary:     {json_path}")
    print("Runtime probe complete; no badge files or flash contents were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
