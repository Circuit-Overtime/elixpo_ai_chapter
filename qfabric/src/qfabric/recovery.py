from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

RECOVERY_SCHEMA_VERSION = 1
DOMAINS = {"linux", "rt"}
CONTRACT_STATES = {"UNKNOWN", "SATISFIED", "AT_RISK", "VIOLATED", "INFEASIBLE"}


class RecoveryState(StrEnum):
    MONITORING = "MONITORING"
    WAITING_BOUNDARY = "WAITING_BOUNDARY"
    PROBATION = "PROBATION"
    ROLLBACK_WAIT = "ROLLBACK_WAIT"
    COOLDOWN = "COOLDOWN"
    INFEASIBLE = "INFEASIBLE"


@dataclass(frozen=True, slots=True)
class RecoveryPolicy:
    probation_windows: int = 3
    probation_max_windows: int = 5
    cooldown_windows: int = 3
    blacklist_windows: int = 5

    def __post_init__(self) -> None:
        if self.probation_windows < 1:
            raise ValueError("probation_windows must be positive")
        if self.probation_max_windows < self.probation_windows:
            raise ValueError("probation_max_windows must be at least probation_windows")
        if self.cooldown_windows < 1:
            raise ValueError("cooldown_windows must be positive")
        if self.blacklist_windows < self.cooldown_windows:
            raise ValueError("blacklist_windows must be at least cooldown_windows")

    def to_dict(self) -> dict[str, int]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> RecoveryPolicy:
        expected = set(cls.__dataclass_fields__)
        unknown = sorted(set(value) - expected)
        if unknown:
            raise ValueError(f"unknown recovery policy fields: {', '.join(unknown)}")
        return cls(**value)


@dataclass(frozen=True, slots=True)
class RecoveryObservation:
    source_contract_state: str
    evidence_valid: bool
    recommended_domain: str | None = None
    semantic_eligible: bool = False
    admission_allowed: bool = False
    predicted_feasible: bool = False
    safe_boundary: bool = False
    target_contract_state: str | None = None
    protected_contracts_healthy: bool = True
    transient_misses: int = 0
    alternatives_exhausted: bool = False

    def __post_init__(self) -> None:
        if self.source_contract_state not in CONTRACT_STATES:
            raise ValueError("invalid source contract state")
        if self.recommended_domain is not None and self.recommended_domain not in DOMAINS:
            raise ValueError("recommended_domain must be linux, rt, or null")
        if (
            self.target_contract_state is not None
            and self.target_contract_state not in CONTRACT_STATES
        ):
            raise ValueError("invalid target contract state")
        if not isinstance(self.evidence_valid, bool):
            raise ValueError("evidence_valid must be boolean")
        if self.transient_misses < 0:
            raise ValueError("transient_misses must not be negative")

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> RecoveryObservation:
        return cls(**value)


class RecoveryController:
    def __init__(self, policy: RecoveryPolicy, *, initial_domain: str, initial_epoch: int):
        if initial_domain not in DOMAINS:
            raise ValueError("initial_domain must be linux or rt")
        if initial_epoch < 0:
            raise ValueError("initial_epoch must not be negative")
        self.policy = policy
        self.state = RecoveryState.MONITORING
        self.current_domain = initial_domain
        self.epoch = initial_epoch
        self.window_index = 0
        self.pending_domain: str | None = None
        self.origin_domain: str | None = None
        self.first_violation_window: int | None = None
        self.detection_window: int | None = None
        self.probation_started_window: int | None = None
        self.probation_observed = 0
        self.probation_healthy_streak = 0
        self.cooldown_remaining = 0
        self.blacklist_remaining: dict[str, int] = {}
        self.steps: list[dict[str, object]] = []
        self.metrics = {
            "credible_violations": 0,
            "detections": 0,
            "switch_attempts": 0,
            "commits": 0,
            "rollbacks": 0,
            "domain_changes": 0,
            "oscillations": 0,
            "false_switches": 0,
            "transient_misses": 0,
            "protected_contract_regressions": 0,
            "detection_delay_windows": [],
            "verified_recovery_windows": [],
        }

    def add(self, observation: RecoveryObservation) -> dict[str, object]:
        self.window_index += 1
        self._tick_blacklist()
        before = self._snapshot()
        actions: list[dict[str, object]] = []
        self.metrics["transient_misses"] += observation.transient_misses
        if not observation.protected_contracts_healthy:
            self.metrics["protected_contract_regressions"] += 1

        if self.state == RecoveryState.MONITORING:
            self._monitor(observation, actions)
        elif self.state == RecoveryState.WAITING_BOUNDARY:
            self._wait_for_boundary(observation, actions)
        elif self.state == RecoveryState.PROBATION:
            self._probation(observation, actions)
        elif self.state == RecoveryState.ROLLBACK_WAIT:
            if observation.safe_boundary:
                self._rollback(actions)
            else:
                actions.append({"type": "rollback_deferred", "reason": "unsafe_boundary"})
        elif self.state == RecoveryState.COOLDOWN:
            self.cooldown_remaining -= 1
            actions.append(
                {"type": "cooldown", "remaining_windows": self.cooldown_remaining}
            )
            if self.cooldown_remaining == 0:
                self.state = RecoveryState.MONITORING
                actions.append({"type": "cooldown_complete"})
        else:
            actions.append({"type": "infeasible_hold"})

        step = {
            "window_index": self.window_index,
            "observation": asdict(observation),
            "before": before,
            "actions": actions,
            "after": self._snapshot(),
        }
        self.steps.append(step)
        return step

    def _monitor(
        self, observation: RecoveryObservation, actions: list[dict[str, object]]
    ) -> None:
        credible = observation.evidence_valid and observation.source_contract_state == "VIOLATED"
        if not credible:
            self.first_violation_window = None
            actions.append({"type": "monitor", "reason": "no_credible_violation"})
            return
        self.metrics["credible_violations"] += 1
        if self.first_violation_window is None:
            self.first_violation_window = self.window_index
        if observation.alternatives_exhausted:
            self.state = RecoveryState.INFEASIBLE
            actions.append({"type": "infeasible", "reason": "alternatives_exhausted"})
            return
        gate_failure = self._candidate_gate_failure(observation)
        if gate_failure is not None:
            actions.append({"type": "recovery_rejected", "reason": gate_failure})
            return
        self.pending_domain = observation.recommended_domain
        self.detection_window = self.window_index
        self.metrics["detections"] += 1
        actions.append({"type": "recovery_armed", "destination": self.pending_domain})
        if observation.safe_boundary:
            self._switch(actions)
        else:
            self.state = RecoveryState.WAITING_BOUNDARY

    def _candidate_gate_failure(self, observation: RecoveryObservation) -> str | None:
        destination = observation.recommended_domain
        if destination is None or destination == self.current_domain:
            return "no_alternate_recommendation"
        if self.blacklist_remaining.get(destination, 0) > 0:
            return "candidate_blacklisted"
        if not observation.semantic_eligible:
            return "semantic_ineligible"
        if not observation.admission_allowed:
            return "destination_not_admitted"
        if not observation.predicted_feasible:
            return "predicted_infeasible"
        return None

    def _wait_for_boundary(
        self, observation: RecoveryObservation, actions: list[dict[str, object]]
    ) -> None:
        if not observation.evidence_valid or observation.source_contract_state != "VIOLATED":
            self.state = RecoveryState.MONITORING
            self.pending_domain = None
            self.detection_window = None
            actions.append({"type": "recovery_cancelled", "reason": "violation_cleared"})
            return
        if observation.recommended_domain != self.pending_domain:
            self.state = RecoveryState.MONITORING
            self.pending_domain = None
            self.detection_window = None
            actions.append({"type": "recovery_cancelled", "reason": "recommendation_changed"})
            return
        gate_failure = self._candidate_gate_failure(observation)
        if gate_failure is not None:
            self.state = RecoveryState.MONITORING
            self.pending_domain = None
            self.detection_window = None
            actions.append({"type": "recovery_cancelled", "reason": gate_failure})
            return
        if observation.safe_boundary:
            self._switch(actions)
        else:
            actions.append({"type": "boundary_wait", "reason": "unsafe_boundary"})

    def _switch(self, actions: list[dict[str, object]]) -> None:
        assert self.pending_domain is not None
        self.origin_domain = self.current_domain
        self.current_domain = self.pending_domain
        self.pending_domain = None
        self.epoch += 1
        self.state = RecoveryState.PROBATION
        self.probation_started_window = self.window_index
        self.probation_observed = 0
        self.probation_healthy_streak = 0
        self.metrics["switch_attempts"] += 1
        self.metrics["domain_changes"] += 1
        if self.first_violation_window is not None:
            self.metrics["detection_delay_windows"].append(
                self.window_index - self.first_violation_window + 1
            )
        actions.append(
            {
                "type": "switch",
                "origin": self.origin_domain,
                "destination": self.current_domain,
                "epoch": self.epoch,
                "safe_boundary": True,
            }
        )

    def _probation(
        self, observation: RecoveryObservation, actions: list[dict[str, object]]
    ) -> None:
        self.probation_observed += 1
        target_failed = observation.target_contract_state in {"VIOLATED", "INFEASIBLE"}
        protected_failed = not observation.protected_contracts_healthy
        if target_failed or protected_failed:
            reason = (
                "protected_contract_regression"
                if protected_failed
                else "target_contract_failure"
            )
            actions.append({"type": "rollback_armed", "reason": reason})
            if observation.safe_boundary:
                self._rollback(actions)
            else:
                self.state = RecoveryState.ROLLBACK_WAIT
            return
        if observation.target_contract_state == "SATISFIED":
            self.probation_healthy_streak += 1
        else:
            self.probation_healthy_streak = 0
        actions.append(
            {
                "type": "probation",
                "healthy_streak": self.probation_healthy_streak,
                "observed_windows": self.probation_observed,
            }
        )
        if self.probation_healthy_streak >= self.policy.probation_windows:
            self.metrics["commits"] += 1
            assert self.detection_window is not None
            self.metrics["verified_recovery_windows"].append(
                self.window_index - self.detection_window + 1
            )
            self.origin_domain = None
            self.detection_window = None
            self.first_violation_window = None
            self.state = RecoveryState.COOLDOWN
            self.cooldown_remaining = self.policy.cooldown_windows
            actions.append(
                {"type": "commit", "domain": self.current_domain, "epoch": self.epoch}
            )
            return
        if self.probation_observed >= self.policy.probation_max_windows:
            actions.append({"type": "rollback_armed", "reason": "probation_timeout"})
            if observation.safe_boundary:
                self._rollback(actions)
            else:
                self.state = RecoveryState.ROLLBACK_WAIT

    def _rollback(self, actions: list[dict[str, object]]) -> None:
        assert self.origin_domain is not None
        failed_domain = self.current_domain
        self.current_domain = self.origin_domain
        self.origin_domain = None
        self.epoch += 1
        self.metrics["rollbacks"] += 1
        self.metrics["domain_changes"] += 1
        self.metrics["oscillations"] += 1
        self.blacklist_remaining[failed_domain] = self.policy.blacklist_windows
        self.state = RecoveryState.COOLDOWN
        self.cooldown_remaining = self.policy.cooldown_windows
        self.pending_domain = None
        self.detection_window = None
        self.first_violation_window = None
        actions.append(
            {
                "type": "rollback",
                "failed_domain": failed_domain,
                "restored_domain": self.current_domain,
                "epoch": self.epoch,
                "safe_boundary": True,
                "blacklist_windows": self.policy.blacklist_windows,
            }
        )

    def _tick_blacklist(self) -> None:
        for domain in list(self.blacklist_remaining):
            remaining = self.blacklist_remaining[domain] - 1
            if remaining <= 0:
                del self.blacklist_remaining[domain]
            else:
                self.blacklist_remaining[domain] = remaining

    def _snapshot(self) -> dict[str, object]:
        return {
            "state": self.state.value,
            "domain": self.current_domain,
            "epoch": self.epoch,
            "pending_domain": self.pending_domain,
            "origin_domain": self.origin_domain,
            "probation_healthy_streak": self.probation_healthy_streak,
            "probation_observed": self.probation_observed,
            "cooldown_remaining": self.cooldown_remaining,
            "blacklist_remaining": dict(sorted(self.blacklist_remaining.items())),
        }

    def report(self) -> dict[str, object]:
        attempts = self.metrics["switch_attempts"]
        commits = self.metrics["commits"]
        rollbacks = self.metrics["rollbacks"]
        return {
            "schema_version": RECOVERY_SCHEMA_VERSION,
            "protocol": "safe-closed-loop-recovery-v1",
            "policy": self.policy.to_dict(),
            "final": self._snapshot(),
            "metrics": {
                **self.metrics,
                "successful_recovery_rate_pct": 100 * commits / attempts if attempts else None,
                "rollback_rate_pct": 100 * rollbacks / attempts if attempts else None,
            },
            "steps": self.steps,
        }


def replay_recovery(
    policy: RecoveryPolicy,
    observations: list[RecoveryObservation],
    *,
    initial_domain: str,
    initial_epoch: int,
) -> dict[str, object]:
    controller = RecoveryController(
        policy, initial_domain=initial_domain, initial_epoch=initial_epoch
    )
    for observation in observations:
        controller.add(observation)
    return controller.report()


def render_recovery(report: dict[str, object]) -> str:
    final = report["final"]
    metrics = report["metrics"]
    return "\n".join(
        (
            "QFabric safe closed-loop recovery replay",
            f"- final state: {final['state']}",
            f"- final domain: {final['domain']}",
            f"- final epoch: {final['epoch']}",
            f"- attempts: {metrics['switch_attempts']}",
            f"- commits: {metrics['commits']}",
            f"- rollbacks: {metrics['rollbacks']}",
            f"- oscillations: {metrics['oscillations']}",
        )
    )


def load_recovery_trace(
    path: Path,
) -> tuple[RecoveryPolicy, str, int, list[RecoveryObservation]]:
    trace = json.loads(path.read_text(encoding="utf-8"))
    if trace.get("schema_version") != RECOVERY_SCHEMA_VERSION:
        raise ValueError("unsupported recovery trace schema version")
    policy = RecoveryPolicy.from_dict(trace["policy"])
    initial = trace["initial"]
    observations = [RecoveryObservation.from_dict(value) for value in trace["observations"]]
    return policy, initial["domain"], initial["epoch"], observations


def write_recovery_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
