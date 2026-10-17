from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

MATRIX_ROWS = 8
MATRIX_COLUMNS = 13
MATRIX_PIXELS = MATRIX_ROWS * MATRIX_COLUMNS
MAX_INTENSITY = 7
LINUX_ROWS = (0, 1, 2)
RPC_ROWS = (3, 4)
RT_ROWS = (5, 6, 7)


class ViewMode(StrEnum):
    PLACEMENT = "placement"
    CONTRACTS = "contracts"
    JITTER = "jitter"
    IPC = "ipc"
    OFF = "off"


class VisualEvent(StrEnum):
    STABLE = "stable"
    VIOLATION = "violation"
    TRANSITION = "transition"
    COMMIT = "commit"
    ROLLBACK = "rollback"
    INFEASIBLE = "infeasible"


CONTRACT_STATES = {"UNKNOWN", "SATISFIED", "AT_RISK", "VIOLATED", "INFEASIBLE"}


@dataclass(frozen=True, slots=True)
class TaskTelemetry:
    decision_id: int
    task: str
    slot: int
    domain: str
    epoch: int
    contract_state: str
    jitter_ns: int
    jitter_bucket: int
    ipc_active: bool
    event: VisualEvent = VisualEvent.STABLE
    source_domain: str | None = None

    def __post_init__(self) -> None:
        if self.decision_id < 1:
            raise ValueError("telemetry decision_id must be positive")
        if not self.task:
            raise ValueError("telemetry task must not be empty")
        if not 0 <= self.slot < MATRIX_COLUMNS:
            raise ValueError("telemetry slot must be between 0 and 12")
        if self.domain not in {"linux", "rt"}:
            raise ValueError("telemetry domain must be linux or rt")
        if self.source_domain not in {None, "linux", "rt"}:
            raise ValueError("telemetry source_domain must be linux, rt, or null")
        if self.epoch < 0:
            raise ValueError("telemetry epoch must not be negative")
        if self.contract_state not in CONTRACT_STATES:
            raise ValueError("telemetry contract state is invalid")
        if self.jitter_ns < 0 or not 0 <= self.jitter_bucket <= 3:
            raise ValueError("telemetry jitter is invalid")

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["event"] = self.event.value
        return value


def _candidate(record: dict[str, Any], domain: str) -> dict[str, Any] | None:
    return next(
        (item for item in record["facts"].get("candidates", []) if item["domain"] == domain),
        None,
    )


def _recovery_event(actions: list[dict[str, Any]]) -> VisualEvent:
    action_types = {action["type"] for action in actions}
    if "rollback" in action_types or "rollback_armed" in action_types:
        return VisualEvent.ROLLBACK
    if "commit" in action_types:
        return VisualEvent.COMMIT
    if "switch" in action_types:
        return VisualEvent.TRANSITION
    if "infeasible" in action_types or "infeasible_hold" in action_types:
        return VisualEvent.INFEASIBLE
    return VisualEvent.STABLE


def _jitter(execution: dict[str, Any] | None, deadline_ns: int) -> tuple[int, int]:
    if execution is None:
        return (0, 0)
    latencies = [
        sample["latency_ns"]
        for sample in execution.get("samples", [])
        if sample.get("outcome") == "ok" and sample.get("latency_ns") is not None
    ]
    if len(latencies) < 2:
        return (0, 0)
    jitter_ns = max(latencies) - min(latencies)
    ratio = jitter_ns / deadline_ns
    if ratio <= 0.02:
        bucket = 0
    elif ratio <= 0.05:
        bucket = 1
    elif ratio <= 0.10:
        bucket = 2
    else:
        bucket = 3
    return (jitter_ns, bucket)


def telemetry_from_decision(record: dict[str, Any], *, slot: int) -> TaskTelemetry:
    facts = record["facts"]
    decision = facts["decision"]
    if record["kind"] == "recommendation":
        classifications = set(decision.get("classifications", []))
        domain = decision["selected_domain"] or decision["current_domain"]
        source = decision["current_domain"]
        selected = _candidate(record, domain)
        evidence_unknown = "insufficient_evidence" in classifications
        contract_state = (
            "UNKNOWN"
            if evidence_unknown or selected is None
            else selected["contract"]["state"]
        )
        event = (
            VisualEvent.TRANSITION
            if decision["move_accepted"]
            else (
                VisualEvent.INFEASIBLE
                if decision["selected_domain"] is None and not evidence_unknown
                else VisualEvent.STABLE
            )
        )
        return TaskTelemetry(
            decision_id=record["decision_id"],
            task=record["task"],
            slot=slot,
            domain=domain,
            source_domain=source if source != domain else None,
            epoch=0,
            contract_state=contract_state,
            jitter_ns=0,
            jitter_bucket=0,
            ipc_active=False,
            event=event,
        )

    step = record["outcome"]
    domain = step["after"]["domain"]
    actions = decision["actions"]
    event = _recovery_event(actions)
    source_domain = step["before"]["domain"] if domain != step["before"]["domain"] else None
    observation = step["observation"]
    contract_state = (
        observation["target_contract_state"]
        if step["before"]["state"] in {"PROBATION", "ROLLBACK_WAIT"}
        and observation["target_contract_state"] is not None
        else observation["source_contract_state"]
    )
    execution = facts.get("execution")
    deadline_ns = facts["thresholds"].get("deadline_ns", 1)
    jitter_ns, jitter_bucket = _jitter(execution, deadline_ns)
    return TaskTelemetry(
        decision_id=record["decision_id"],
        task=record["task"],
        slot=slot,
        domain=domain,
        source_domain=source_domain,
        epoch=step["after"]["epoch"],
        contract_state=contract_state,
        jitter_ns=jitter_ns,
        jitter_bucket=jitter_bucket,
        ipc_active=execution is not None,
        event=event,
    )


def _pixel(frame: list[int], row: int, column: int, intensity: int) -> None:
    frame[row * MATRIX_COLUMNS + column] = intensity


def _domain_rows(domain: str) -> tuple[int, int, int]:
    return LINUX_ROWS if domain == "linux" else RT_ROWS


def _contract_intensity(state: str) -> int:
    return {
        "UNKNOWN": 1,
        "SATISFIED": 3,
        "AT_RISK": 5,
        "VIOLATED": 7,
        "INFEASIBLE": 7,
    }[state]


def _render_base(frame: list[int], mode: ViewMode, item: TaskTelemetry) -> None:
    rows = _domain_rows(item.domain)
    if mode == ViewMode.PLACEMENT:
        for row in rows:
            _pixel(frame, row, item.slot, _contract_intensity(item.contract_state))
        if item.ipc_active:
            for row in RPC_ROWS:
                _pixel(frame, row, item.slot, 2)
    elif mode == ViewMode.CONTRACTS:
        intensity = _contract_intensity(item.contract_state)
        for row in rows:
            _pixel(frame, row, item.slot, intensity)
    elif mode == ViewMode.JITTER:
        intensity = (1, 2, 4, 7)[item.jitter_bucket]
        for row in rows:
            _pixel(frame, row, item.slot, intensity)
    elif mode == ViewMode.IPC and item.ipc_active:
        for row in RPC_ROWS:
            _pixel(frame, row, item.slot, 7)


def _render_overlay(frame: list[int], item: TaskTelemetry) -> None:
    column = item.slot
    if item.event == VisualEvent.STABLE:
        return
    if item.event == VisualEvent.VIOLATION:
        for row in _domain_rows(item.domain):
            _pixel(frame, row, column, 7)
        return
    if item.event in {VisualEvent.TRANSITION, VisualEvent.ROLLBACK}:
        source = item.source_domain or ("rt" if item.domain == "linux" else "linux")
        source_intensity = 4 if item.event == VisualEvent.TRANSITION else 7
        for row in _domain_rows(source):
            _pixel(frame, row, column, source_intensity)
        for row in RPC_ROWS:
            _pixel(frame, row, column, 7)
        for row in _domain_rows(item.domain):
            _pixel(frame, row, column, 7 if item.event == VisualEvent.TRANSITION else 4)
        return
    if item.event == VisualEvent.COMMIT:
        for row in _domain_rows(item.domain):
            _pixel(frame, row, column, 7)
        for row in RPC_ROWS:
            _pixel(frame, row, column, 3)
        return
    if item.event == VisualEvent.INFEASIBLE:
        for row in range(MATRIX_ROWS):
            _pixel(frame, row, column, 7 if row % 2 == 0 else 1)


def render_frame(
    mode: ViewMode | str,
    telemetry: list[TaskTelemetry],
    *,
    overlay: TaskTelemetry | None = None,
) -> tuple[int, ...]:
    selected_mode = ViewMode(mode)
    if len({item.slot for item in telemetry}) != len(telemetry):
        raise ValueError("active QTasks must use unique matrix slots")
    frame = [0] * MATRIX_PIXELS
    if selected_mode == ViewMode.OFF:
        return tuple(frame)
    for item in telemetry:
        _render_base(frame, selected_mode, item)
    if overlay is not None:
        _render_overlay(frame, overlay)
    return tuple(frame)


def changed_pixels(
    previous: tuple[int, ...], current: tuple[int, ...]
) -> list[dict[str, int]]:
    if len(previous) != MATRIX_PIXELS or len(current) != MATRIX_PIXELS:
        raise ValueError("matrix frames must contain exactly 104 pixels")
    return [
        {
            "row": index // MATRIX_COLUMNS,
            "column": index % MATRIX_COLUMNS,
            "intensity": value,
        }
        for index, value in enumerate(current)
        if previous[index] != value
    ]


def frame_checksum(frame: tuple[int, ...]) -> int:
    if len(frame) != MATRIX_PIXELS or any(not 0 <= value <= MAX_INTENSITY for value in frame):
        raise ValueError("invalid matrix frame")
    return int(math.fsum((index + 1) * value for index, value in enumerate(frame)))
