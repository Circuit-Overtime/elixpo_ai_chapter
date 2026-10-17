from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class Measurement:
    run_id: str
    experiment: str
    sequence: int
    started_utc: str
    latency_ns: int
    outcome: str
    payload_bytes: int = 0
    mcu_value: int | None = None
    detail: str | None = None
    concurrency: int = 1
    batch_elapsed_ns: int | None = None
    linux_started_ns: int | None = None
    linux_finished_ns: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["schema_version"] = SCHEMA_VERSION
        return result


@dataclass(frozen=True, slots=True)
class DistributionSummary:
    count: int
    minimum: int | None
    p50: float | None
    p95: float | None
    p99: float | None
    maximum: int | None
    mean: float | None
    stdev: float | None

    def to_dict(self) -> dict[str, int | float | None]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Summary:
    total: int
    count: int
    failures: int
    failure_rate_pct: float
    minimum_ns: int | None
    p50_ns: float | None
    p95_ns: float | None
    p99_ns: float | None
    maximum_ns: int | None
    mean_ns: float | None
    stdev_ns: float | None
    sequential_calls_per_second: float | None

    def to_dict(self) -> dict[str, int | float | None]:
        return asdict(self)
