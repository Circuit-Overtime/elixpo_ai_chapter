from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

CONTRACT_SCHEMA_VERSION = 1


class ContractState(StrEnum):
    UNKNOWN = "UNKNOWN"
    SATISFIED = "SATISFIED"
    AT_RISK = "AT_RISK"
    VIOLATED = "VIOLATED"
    INFEASIBLE = "INFEASIBLE"


class WindowClass(StrEnum):
    HEALTHY = "healthy"
    RISKY = "risky"
    VIOLATING = "violating"


@dataclass(frozen=True, slots=True)
class DeadlineContract:
    deadline_ns: int
    window_size: int = 1000
    minimum_samples: int = 20
    warmup_samples: int = 10
    max_miss_rate_pct: float = 1.0
    at_risk_miss_rate_pct: float = 0.5
    recovery_miss_rate_pct: float = 0.25
    violation_windows: int = 3
    recovery_windows: int = 3
    infeasible_windows: int = 5

    def __post_init__(self) -> None:
        if self.deadline_ns < 1:
            raise ValueError("deadline_ns must be positive")
        if self.window_size < 1:
            raise ValueError("window_size must be positive")
        if not 1 <= self.minimum_samples <= self.window_size:
            raise ValueError("minimum_samples must be within window_size")
        if self.warmup_samples < 0:
            raise ValueError("warmup_samples must not be negative")
        if not (
            0
            <= self.recovery_miss_rate_pct
            <= self.at_risk_miss_rate_pct
            <= self.max_miss_rate_pct
            < 100
        ):
            raise ValueError(
                "miss-rate thresholds must satisfy 0 <= recovery <= at-risk <= maximum < 100"
            )
        if self.violation_windows < 1:
            raise ValueError("violation_windows must be positive")
        if self.recovery_windows < 1:
            raise ValueError("recovery_windows must be positive")
        if self.infeasible_windows < self.violation_windows:
            raise ValueError("infeasible_windows must be at least violation_windows")

    def to_dict(self) -> dict[str, int | float]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> DeadlineContract:
        expected = {field for field in cls.__dataclass_fields__}
        unknown = sorted(set(value) - expected)
        if unknown:
            raise ValueError(f"unknown contract fields: {', '.join(unknown)}")
        return cls(**value)


@dataclass(frozen=True, slots=True)
class ContractObservation:
    outcome: str
    latency_ns: int | None = None

    def __post_init__(self) -> None:
        if self.outcome not in {"ok", "error", "timeout", "missing"}:
            raise ValueError(f"unsupported contract outcome: {self.outcome}")
        if self.outcome == "ok" and self.latency_ns is None:
            raise ValueError("an ok observation requires latency_ns")
        if self.outcome != "ok" and self.latency_ns is not None:
            raise ValueError("a non-ok observation must not include latency_ns")
        if self.latency_ns is not None and self.latency_ns < 0:
            raise ValueError("latency_ns must not be negative")

    @property
    def has_timing(self) -> bool:
        return self.latency_ns is not None

    def missed(self, deadline_ns: int) -> bool:
        return self.latency_ns is None or self.latency_ns > deadline_ns

    def to_dict(self) -> dict[str, str | int | None]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> ContractObservation:
        return cls(outcome=value.get("outcome", "missing"), latency_ns=value.get("latency_ns"))


def _wilson_interval(misses: int, count: int) -> tuple[float, float]:
    if count < 1:
        return (0.0, 100.0)
    z = 1.959963984540054
    proportion = misses / count
    denominator = 1 + z * z / count
    centre = (proportion + z * z / (2 * count)) / denominator
    margin = (
        z
        * math.sqrt(proportion * (1 - proportion) / count + z * z / (4 * count * count))
        / denominator
    )
    return (100 * max(0.0, centre - margin), 100 * min(1.0, centre + margin))


class DeadlineContractEvaluator:
    def __init__(self, contract: DeadlineContract):
        self.contract = contract
        self.state = ContractState.UNKNOWN
        self.observations = 0
        self.warmup_observed = 0
        self.evidence_count = 0
        self.window_index = 0
        self.violation_streak = 0
        self.recovery_streak = 0
        self.infeasible_streak = 0
        self._window: list[ContractObservation] = []
        self.windows: list[dict[str, object]] = []

    def add(self, observation: ContractObservation) -> dict[str, object] | None:
        self.observations += 1
        if self.warmup_observed < self.contract.warmup_samples:
            self.warmup_observed += 1
            return None
        self._window.append(observation)
        if len(self._window) < self.contract.window_size:
            return None
        result = self._evaluate_window(self._window)
        self._window = []
        self.windows.append(result)
        return result

    def _evaluate_window(self, observations: list[ContractObservation]) -> dict[str, object]:
        self.window_index += 1
        state_before = self.state
        sample_count = len(observations)
        timed_samples = sum(observation.has_timing for observation in observations)
        missing_samples = sample_count - timed_samples
        misses = sum(
            observation.missed(self.contract.deadline_ns) for observation in observations
        )
        miss_rate_pct = 100 * misses / sample_count
        self.evidence_count += sample_count

        if miss_rate_pct > self.contract.max_miss_rate_pct:
            window_class = WindowClass.VIOLATING
            self.violation_streak += 1
        elif miss_rate_pct > self.contract.at_risk_miss_rate_pct:
            window_class = WindowClass.RISKY
            self.violation_streak = 0
        else:
            window_class = WindowClass.HEALTHY
            self.violation_streak = 0

        if miss_rate_pct <= self.contract.recovery_miss_rate_pct:
            self.recovery_streak += 1
        else:
            self.recovery_streak = 0

        if misses == sample_count:
            self.infeasible_streak += 1
        else:
            self.infeasible_streak = 0

        enough_evidence = self.evidence_count >= self.contract.minimum_samples
        if enough_evidence:
            self.state = self._next_state(window_class)

        confidence_low_pct, confidence_high_pct = _wilson_interval(misses, sample_count)
        return {
            "window_index": self.window_index,
            "state_before": state_before.value,
            "state_after": self.state.value,
            "transitioned": state_before != self.state,
            "classification": window_class.value,
            "sample_count": sample_count,
            "timed_samples": timed_samples,
            "missing_samples": missing_samples,
            "misses": misses,
            "miss_rate_pct": miss_rate_pct,
            "evidence_count": self.evidence_count,
            "minimum_samples": self.contract.minimum_samples,
            "estimator_valid": enough_evidence,
            "confidence": {
                "method": "wilson-score",
                "level_pct": 95.0,
                "miss_rate_low_pct": confidence_low_pct,
                "miss_rate_high_pct": confidence_high_pct,
            },
            "streaks": {
                "violating": self.violation_streak,
                "recovery": self.recovery_streak,
                "infeasible": self.infeasible_streak,
            },
        }

    def _next_state(self, window_class: WindowClass) -> ContractState:
        if self.infeasible_streak >= self.contract.infeasible_windows:
            return ContractState.INFEASIBLE
        if self.state in {ContractState.VIOLATED, ContractState.INFEASIBLE}:
            if self.recovery_streak >= self.contract.recovery_windows:
                return ContractState.SATISFIED
            return self.state
        if self.violation_streak >= self.contract.violation_windows:
            return ContractState.VIOLATED
        if self.state == ContractState.AT_RISK:
            if self.recovery_streak >= self.contract.recovery_windows:
                return ContractState.SATISFIED
            return ContractState.AT_RISK
        if window_class in {WindowClass.RISKY, WindowClass.VIOLATING}:
            return ContractState.AT_RISK
        return ContractState.SATISFIED

    def report(self) -> dict[str, object]:
        return {
            "schema_version": CONTRACT_SCHEMA_VERSION,
            "claim": "empirical-soft-real-time",
            "contract": self.contract.to_dict(),
            "missing_sample_policy": "count-as-deadline-miss",
            "windowing": "non-overlapping",
            "state": self.state.value,
            "observations": self.observations,
            "warmup_observed": self.warmup_observed,
            "evidence_count": self.evidence_count,
            "pending_samples": len(self._window),
            "windows": self.windows,
        }


def replay_contract(
    contract: DeadlineContract, observations: list[ContractObservation]
) -> dict[str, object]:
    evaluator = DeadlineContractEvaluator(contract)
    for observation in observations:
        evaluator.add(observation)
    return evaluator.report()


def render_contract_status(report: dict[str, object]) -> str:
    contract = report["contract"]
    lines = [
        "QFabric empirical soft real-time contract",
        f"- state: {report['state']}",
        f"- evidence: {report['evidence_count']} observations across "
        f"{len(report['windows'])} complete windows",
        f"- pending: {report['pending_samples']} observations",
        f"- deadline: {contract['deadline_ns'] / 1_000:.3f} us",
    ]
    if report["windows"]:
        latest = report["windows"][-1]
        lines.append(
            f"- latest window: {latest['classification']}, "
            f"miss-rate={latest['miss_rate_pct']:.3f}%"
        )
    return "\n".join(lines)


def load_contract_trace(path: Path) -> tuple[DeadlineContract, list[ContractObservation]]:
    trace = json.loads(path.read_text(encoding="utf-8"))
    if trace.get("schema_version") != CONTRACT_SCHEMA_VERSION:
        raise ValueError("unsupported contract trace schema version")
    if not isinstance(trace.get("contract"), dict):
        raise ValueError("contract trace is missing a contract")
    if not isinstance(trace.get("observations"), list):
        raise ValueError("contract trace is missing observations")
    contract = DeadlineContract.from_dict(trace["contract"])
    if not all(isinstance(value, dict) for value in trace["observations"]):
        raise ValueError("contract observations must be objects")
    observations = [ContractObservation.from_dict(value) for value in trace["observations"]]
    return contract, observations


def write_contract_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
