from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from pathlib import Path

from .model import Measurement


def append_measurements(path: Path, measurements: Iterable[Measurement]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        for measurement in measurements:
            json.dump(measurement.to_dict(), stream, sort_keys=True)
            stream.write("\n")


def load_measurements(path: Path) -> Iterator[Measurement]:
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            raw = json.loads(line)
            if raw.get("schema_version") != 1:
                raise ValueError(f"{path}:{line_number}: unsupported schema version")
            yield Measurement(
                run_id=str(raw["run_id"]),
                experiment=str(raw["experiment"]),
                sequence=int(raw["sequence"]),
                started_utc=str(raw["started_utc"]),
                latency_ns=int(raw["latency_ns"]),
                outcome=str(raw["outcome"]),
                payload_bytes=int(raw.get("payload_bytes", 0)),
                mcu_value=(None if raw.get("mcu_value") is None else int(raw["mcu_value"])),
                detail=(None if raw.get("detail") is None else str(raw["detail"])),
                concurrency=int(raw.get("concurrency", 1)),
                batch_elapsed_ns=(
                    None
                    if raw.get("batch_elapsed_ns") is None
                    else int(raw["batch_elapsed_ns"])
                ),
                linux_started_ns=(
                    None
                    if raw.get("linux_started_ns") is None
                    else int(raw["linux_started_ns"])
                ),
                linux_finished_ns=(
                    None
                    if raw.get("linux_finished_ns") is None
                    else int(raw["linux_finished_ns"])
                ),
            )
