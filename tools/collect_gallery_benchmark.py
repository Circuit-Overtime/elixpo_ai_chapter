#!/usr/bin/env python3
"""Arm and capture an integrated OreoOS Gallery RV565 benchmark."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time

try:
    import serial
except ImportError as exc:
    raise SystemExit("pyserial is required; use the repository .venv") from exc


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "paper/measurements"
PREFIX = "RV565_OS_"
FRAME_COLUMNS = (
    "sequence", "source_frame", "read_us", "inflate_us", "scale_us",
    "draw_us", "present_us", "work_us", "deadline_missed",
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture 720 frames from the real OreoOS Gallery loop."
    )
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--timeout", type=float, default=180)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--python", type=Path)
    parser.add_argument("--no-reset", action="store_true")
    return parser.parse_args()


def mpremote_python(explicit: Path | None) -> Path:
    candidates = [explicit] if explicit else [
        REPO_ROOT / ".venv/bin/python3",
        REPO_ROOT / ".venv/bin/python",
        Path(sys.executable),
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            check = subprocess.run(
                [str(candidate), "-m", "mpremote", "--help"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if check.returncode == 0:
                return candidate.absolute()
    raise SystemExit("No Python environment containing mpremote was found")


def arm(port: str, python: Path) -> None:
    command = [
        str(python), "-m", "mpremote", "connect", port, "exec",
        "open('/.rv565-benchmark','wb').close()",
    ]
    result = subprocess.run(
        command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, timeout=30, check=False,
    )
    if result.returncode != 0:
        print(result.stdout, end="")
        raise SystemExit("Could not arm the Gallery benchmark flag")


def reset(connection: serial.Serial) -> None:
    connection.dtr = False
    connection.rts = True
    time.sleep(0.12)
    connection.rts = False
    time.sleep(0.4)
    connection.reset_input_buffer()


def capture(args: argparse.Namespace) -> list[str]:
    python = mpremote_python(args.python)
    print(f"Arming one-shot Gallery benchmark on {args.port} ...", flush=True)
    arm(args.port, python)
    lines: list[str] = []
    deadline = time.monotonic() + args.timeout
    frames = 0
    with serial.Serial(args.port, args.baud, timeout=0.25) as connection:
        if not args.no_reset:
            reset(connection)
        print("Open Gallery on the badge; the first RV565 video is selected automatically.")
        print("Waiting for 48 warm-up + 720 measured frames ...", flush=True)
        while time.monotonic() < deadline:
            raw = connection.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            lines.append(line)
            if line.startswith("RV565_OS_FRAME,"):
                frames += 1
                if frames % 120 == 0:
                    print(f"Captured {frames}/720 frame records ...", flush=True)
            elif line.startswith(PREFIX) and not line.startswith("RV565_OS_FRAME,"):
                print(line, flush=True)
            if line == "RV565_OS_END":
                return lines
    raise SystemExit(
        "Timed out. Ensure the updated OS is deployed, then open Gallery and "
        "leave the video playing until capture completes."
    )


def key_values(text: str) -> dict[str, int | float | str]:
    result: dict[str, int | float | str] = {}
    for item in text.split(","):
        key, separator, value = item.partition("=")
        if not separator:
            continue
        try:
            result[key] = int(value)
        except ValueError:
            try:
                result[key] = float(value)
            except ValueError:
                result[key] = value
    return result


def percentile(values: list[int], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    return (ordered[lower] * (upper - position) +
            ordered[upper] * (position - lower))


def digest(path: Path) -> str | None:
    if not path.is_file():
        return None
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def parse(lines: list[str]) -> tuple[dict[str, object], list[dict[str, int]]]:
    ready: dict[str, object] = {}
    summary: dict[str, object] | None = None
    frames: list[dict[str, int]] = []
    for line in lines:
        if line.startswith("RV565_OS_READY,"):
            ready = key_values(line[len("RV565_OS_READY,"):])
        elif line.startswith("RV565_OS_SUMMARY,"):
            summary = key_values(line[len("RV565_OS_SUMMARY,"):])
        elif line.startswith("RV565_OS_FRAME,"):
            values = line.split(",")[1:]
            if len(values) == len(FRAME_COLUMNS):
                frames.append(dict(zip(FRAME_COLUMNS, map(int, values))))
    if summary is None:
        raise SystemExit("Capture contained no integrated summary")
    expected = int(summary["frames"])
    if len(frames) != expected or expected != 720:
        raise SystemExit(f"Expected 720 frames, captured {len(frames)}")
    if [row["sequence"] for row in frames] != list(range(expected)):
        raise SystemExit("Frame sequence is incomplete or out of order")
    timing: dict[str, dict[str, float]] = {}
    for field in FRAME_COLUMNS[2:8]:
        values = [row[field] for row in frames]
        timing[field] = {
            "mean": sum(values) / len(values),
            "p50": percentile(values, 0.50),
            "p95": percentile(values, 0.95),
            "p99": percentile(values, 0.99),
            "maximum": float(max(values)),
        }
    return {"ready": ready, "summary": summary, "timing_us": timing}, frames


def main() -> int:
    args = arguments()
    if args.timeout <= 0 or args.baud <= 0:
        raise SystemExit("--timeout and --baud must be positive")
    lines = capture(args)
    record, frames = parse(lines)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output_dir.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    stem = f"video-benchmark-oreoos-gallery-{stamp}"
    log_path = output / f"{stem}.log"
    csv_path = output / f"{stem}.csv"
    json_path = output / f"{stem}.json"
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=FRAME_COLUMNS)
        writer.writeheader()
        writer.writerows(frames)
    media = sorted((REPO_ROOT / "apps/gallery/assets/optimized").glob("*.rv565"))
    record.update({
        "collector_schema_version": 1,
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "artifacts": {
            "gallery": digest(REPO_ROOT / "apps/gallery/src/app.py"),
            "launcher": digest(REPO_ROOT / "oreoOS/launcher.py"),
            "firmware_module": digest(
                REPO_ROOT / "firmware/usermods/oreo_rv565/modoreo_rv565.c"),
            "media": digest(media[0]) if media else None,
        },
        "frame_csv": csv_path.name,
        "raw_log": log_path.name,
    })
    json_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    work = record["timing_us"]["work_us"]
    summary = record["summary"]
    print("\nValidated integrated Gallery benchmark")
    print(f"  FPS:       {summary['fps']}")
    print(f"  Drops:     {summary['drops']}")
    print(f"  Misses:    {summary['deadline_misses']}")
    print(f"  Work p50:  {work['p50'] / 1000:.3f} ms")
    print(f"  Work p95:  {work['p95'] / 1000:.3f} ms")
    print(f"  Work p99:  {work['p99'] / 1000:.3f} ms")
    print(f"  Raw log:   {log_path}")
    print(f"  Frame CSV: {csv_path}")
    print(f"  Summary:   {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
