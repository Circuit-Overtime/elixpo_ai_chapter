from __future__ import annotations

import json
import math
import threading
from collections import deque
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

PROFILE_SCHEMA_VERSION = 1


class Instrumentation(StrEnum):
    DISABLED = "disabled"
    REDUCED = "reduced"
    FULL = "full"


@dataclass(frozen=True, slots=True)
class ProfileSample:
    task: str
    task_id: int
    invocation_id: int
    epoch: int
    domain: str
    instrumentation: Instrumentation
    outcome: str
    linux_started_ns: int | None = None
    linux_finished_ns: int | None = None
    local_execution_ns: int | None = None
    communication_ns: int | None = None
    queueing_ns: int | None = None
    deadline_ns: int | None = None
    deadline_met: bool | None = None
    mcu_execution_us: int | None = None
    mcu_queue_us: int | None = None

    def __post_init__(self) -> None:
        if self.domain not in {"linux", "rt"}:
            raise ValueError(f"unsupported profiling domain: {self.domain}")
        if self.outcome not in {"ok", "error", "timeout"}:
            raise ValueError(f"unsupported profiling outcome: {self.outcome}")
        for name in (
            "task_id",
            "invocation_id",
            "epoch",
            "linux_started_ns",
            "linux_finished_ns",
            "local_execution_ns",
            "communication_ns",
            "queueing_ns",
            "deadline_ns",
            "mcu_execution_us",
            "mcu_queue_us",
        ):
            value = getattr(self, name)
            if value is not None and value < 0:
                raise ValueError(f"{name} must not be negative")
        if (self.linux_started_ns is None) != (self.linux_finished_ns is None):
            raise ValueError("Linux timing requires both interval endpoints")
        if (
            self.linux_started_ns is not None
            and self.linux_finished_ns is not None
            and self.linux_finished_ns < self.linux_started_ns
        ):
            raise ValueError("Linux timing interval is negative")
        if self.deadline_met is not None and self.deadline_ns is None:
            raise ValueError("deadline_met requires a deadline")

    @property
    def end_to_end_ns(self) -> int | None:
        if self.linux_started_ns is None or self.linux_finished_ns is None:
            return None
        return self.linux_finished_ns - self.linux_started_ns

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result["instrumentation"] = self.instrumentation.value
        result["end_to_end_ns"] = self.end_to_end_ns
        return result


@dataclass(frozen=True, slots=True)
class MetricSummary:
    count: int
    minimum: int | None
    mean: float | None
    p50: float | None
    p95: float | None
    p99: float | None
    maximum: int | None
    stdev: float | None

    def to_dict(self) -> dict[str, int | float | None]:
        return asdict(self)


def percentile(values: list[int], percentage: float) -> float:
    if not values:
        raise ValueError("a percentile requires at least one value")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * percentage / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def summarize_metric(values: Iterable[int]) -> MetricSummary:
    collected = list(values)
    if not collected:
        return MetricSummary(0, None, None, None, None, None, None, None)
    mean = sum(collected) / len(collected)
    variance = sum((value - mean) ** 2 for value in collected) / len(collected)
    return MetricSummary(
        count=len(collected),
        minimum=min(collected),
        mean=mean,
        p50=percentile(collected, 50),
        p95=percentile(collected, 95),
        p99=percentile(collected, 99),
        maximum=max(collected),
        stdev=math.sqrt(variance),
    )


class InvocationSequencer:
    def __init__(self, epoch: int, *, first_counter: int = 1):
        if not 0 <= epoch <= (1 << 32) - 1:
            raise ValueError("epoch must fit in u32")
        if not 1 <= first_counter <= (1 << 32) - 1:
            raise ValueError("first counter must be between 1 and u32 maximum")
        self.epoch = epoch
        self._counter = first_counter
        self._lock = threading.Lock()

    def next(self) -> int:
        with self._lock:
            if self._counter > (1 << 32) - 1:
                raise OverflowError("invocation counter is exhausted for this epoch")
            invocation_id = (self.epoch << 32) | self._counter
            self._counter += 1
            return invocation_id


class ProfileWindow:
    def __init__(self, capacity: int, warmup: int, minimum_samples: int):
        if capacity < 1:
            raise ValueError("profile capacity must be positive")
        if warmup < 0:
            raise ValueError("profile warmup must not be negative")
        if not 1 <= minimum_samples <= capacity:
            raise ValueError("minimum samples must be within the window capacity")
        self.capacity = capacity
        self.warmup = warmup
        self.minimum_samples = minimum_samples
        self.observed = 0
        self.warmup_observed = 0
        self.dropped = 0
        self.samples: deque[ProfileSample] = deque()

    def add(self, sample: ProfileSample) -> None:
        self.observed += 1
        if self.warmup_observed < self.warmup:
            self.warmup_observed += 1
            return
        if len(self.samples) == self.capacity:
            self.samples.popleft()
            self.dropped += 1
        self.samples.append(sample)

    def report(self, task: str, domain: str, instrumentation: str) -> dict[str, object]:
        successful = [sample for sample in self.samples if sample.outcome == "ok"]
        end_to_end = [
            value for sample in successful if (value := sample.end_to_end_ns) is not None
        ]
        local = [
            sample.local_execution_ns
            for sample in successful
            if sample.local_execution_ns is not None
        ]
        communication = [
            sample.communication_ns
            for sample in successful
            if sample.communication_ns is not None
        ]
        queueing = [
            sample.queueing_ns for sample in successful if sample.queueing_ns is not None
        ]
        jitter = [
            abs(current - previous)
            for previous, current in zip(end_to_end, end_to_end[1:], strict=False)
        ]
        deadline_samples = [sample for sample in self.samples if sample.deadline_met is not None]
        deadline_misses = sum(sample.deadline_met is False for sample in deadline_samples)
        valid = len(successful) >= self.minimum_samples
        if self.warmup_observed < self.warmup:
            invalid_reason = "warmup-incomplete"
        elif not valid:
            invalid_reason = "insufficient-samples"
        else:
            invalid_reason = None
        return {
            "task": task,
            "domain": domain,
            "current_domain": domain,
            "invocation_count": self.observed,
            "successful_samples": len(successful),
            "failures": len(self.samples) - len(successful),
            "instrumentation": instrumentation,
            "window": {
                "capacity": self.capacity,
                "warmup_required": self.warmup,
                "warmup_observed": self.warmup_observed,
                "retained_samples": len(self.samples),
                "dropped_samples": self.dropped,
                "minimum_samples": self.minimum_samples,
                "estimator_valid": valid,
                "invalid_reason": invalid_reason,
            },
            "deadline": {
                "evaluated": len(deadline_samples),
                "misses": deadline_misses,
                "met_pct": (
                    100 * (len(deadline_samples) - deadline_misses) / len(deadline_samples)
                    if deadline_samples
                    else None
                ),
            },
            "metrics_ns": {
                "end_to_end": summarize_metric(end_to_end).to_dict(),
                "local_execution": summarize_metric(local).to_dict(),
                "communication": summarize_metric(communication).to_dict(),
                "queueing": summarize_metric(queueing).to_dict(),
                "jitter": summarize_metric(jitter).to_dict(),
            },
            "clock_semantics": {
                "end_to_end": "linux-monotonic-interval",
                "linux_local": "linux-monotonic-duration",
                "mcu_local": "mcu-monotonic-duration",
                "cross_clock_subtraction": False,
            },
            "samples": [sample.to_dict() for sample in self.samples],
        }


class ProfileCollector:
    def __init__(self, *, capacity: int = 1024, warmup: int = 10, minimum_samples: int = 20):
        self.capacity = capacity
        self.warmup = warmup
        self.minimum_samples = minimum_samples
        self._windows: dict[tuple[str, str, str], ProfileWindow] = {}
        self._invocation_ids: set[int] = set()

    def add(self, sample: ProfileSample) -> None:
        if sample.invocation_id in self._invocation_ids:
            raise ValueError(f"duplicate profile invocation_id: {sample.invocation_id}")
        self._invocation_ids.add(sample.invocation_id)
        key = (sample.task, sample.domain, sample.instrumentation.value)
        window = self._windows.setdefault(
            key,
            ProfileWindow(self.capacity, self.warmup, self.minimum_samples),
        )
        window.add(sample)

    def report(self) -> dict[str, object]:
        return {
            "schema_version": PROFILE_SCHEMA_VERSION,
            "captured_utc": datetime.now(UTC).isoformat(),
            "groups": [
                self._windows[key].report(*key)
                for key in sorted(self._windows, key=lambda item: (item[0], item[1], item[2]))
            ],
        }


def write_profile(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_profile(path: Path) -> dict[str, object]:
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("schema_version") != PROFILE_SCHEMA_VERSION:
        raise ValueError("unsupported profile schema version")
    if not isinstance(report.get("groups"), list):
        raise ValueError("profile report is missing groups")
    return report


def render_status(report: dict[str, object]) -> str:
    groups = report["groups"]
    if not groups:
        return "QFabric profile: no measurements"
    lines = ["QFabric profile status"]
    for group in groups:
        window = group["window"]
        latency = group["metrics_ns"]["end_to_end"]
        validity = "valid" if window["estimator_valid"] else window["invalid_reason"]
        p95 = "n/a" if latency["p95"] is None else f"{latency['p95'] / 1_000:.3f} us"
        lines.append(
            f"- {group['task']} [{group['domain']}/{group['instrumentation']}]: "
            f"invocations={group['invocation_count']}, "
            f"retained={window['retained_samples']}, p95={p95}, estimator={validity}"
        )
    return "\n".join(lines)
