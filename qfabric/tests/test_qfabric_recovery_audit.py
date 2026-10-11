import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.recovery_audit import audit_stage7
from qfabric.recovery_closed_loop import run_hardware_recovery
from qfabric.recovery_runtime import ExecutionSample, ExecutionWindow
from qfabric.recovery_scenarios import run_recovery_scenarios


def recommendation_input():
    return {
        "schema_version": 1,
        "policy": {"minimum_evidence": 4, "cooldown_active": False},
        "mcu": {"utilization_without_task_pct": 20, "reserved_headroom_pct": 25},
        "tasks": [
            {
                "name": "add",
                "effect": "Q_PURE",
                "current_domain": "linux",
                "transition_hooks_declared": False,
                "rate_hz": 100,
                "contract": {"deadline_ns": 20_000_000, "max_miss_rate_pct": 1},
                "chain_edges": [],
                "candidates": {
                    domain: {
                        "evidence_count": 1000,
                        "end_to_end_p95_ns": 8_000_000 if domain == "linux" else 11_000_000,
                        "local_execution_p95_ns": 4_000 if domain == "linux" else 300,
                        "observed_miss_rate_pct": 0,
                        "contract_state": "SATISFIED",
                        "admission_allowed": True,
                    }
                    for domain in ("linux", "rt")
                },
            }
        ],
    }


class AuditBackend:
    failure_windows: set[int] = set()

    def __init__(
        self,
        root,
        address,
        *,
        initial_domain,
        initial_epoch,
        invocations_per_window,
        **kwargs,
    ):
        self.placement_domain = initial_domain
        self.epoch = initial_epoch
        self.invocations_per_window = invocations_per_window

    def execute_window(self, window_index):
        latency_ns = 30_000_000 if window_index in self.failure_windows else 10_000_000
        delay_ns = 20_000_000 if window_index in self.failure_windows else 0
        return ExecutionWindow(
            window_index=window_index,
            domain=self.placement_domain,
            epoch=self.epoch,
            samples=tuple(
                ExecutionSample("ok", latency_ns, delay_ns)
                for _ in range(self.invocations_per_window)
            ),
            protected_contracts_healthy=True,
            in_flight_after=0,
        )

    def transition(self, domain, epoch):
        self.placement_domain = domain
        self.epoch = epoch

    def close(self):
        pass


class QFabricRecoveryAuditTests(unittest.TestCase):
    def build_evidence(self, root):
        source = recommendation_input()
        input_path = root / "recommendation-input.json"
        input_path.write_text(json.dumps(source), encoding="utf-8")
        (root / "recovery-scenarios.json").write_text(
            json.dumps(run_recovery_scenarios()), encoding="utf-8"
        )
        for mode, failed in (
            ("success", {1, 2, 3}),
            ("rollback", {1, 2, 3, 4, 5, 6}),
        ):
            AuditBackend.failure_windows = failed
            with patch(
                "qfabric.recovery_closed_loop.DualDomainAddBackend", AuditBackend
            ):
                report = run_hardware_recovery(
                    root=root,
                    address="unused",
                    recommendation_input=copy.deepcopy(source),
                    mode=mode,
                    task="add",
                    initial_epoch=10,
                    invocations_per_window=4,
                )
            (root / f"hardware-{mode}.json").write_text(
                json.dumps(report), encoding="utf-8"
            )
        return input_path

    def test_complete_stage7_evidence_passes_independent_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = self.build_evidence(root)
            report = audit_stage7(root, input_path)
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["deterministic_scenarios"]["count"], 10)
        self.assertEqual(sum(item["samples"] for item in report["hardware"]), 72)
        self.assertTrue(all(item["replay_valid"] for item in report["hardware"]))

    def test_tampered_sample_injection_label_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = self.build_evidence(root)
            path = root / "hardware-success.json"
            report = json.loads(path.read_text())
            report["runtime"]["windows"][0]["execution"]["samples"][0][
                "injected_delay_ns"
            ] = 0
            path.write_text(json.dumps(report), encoding="utf-8")
            audit = audit_stage7(root, input_path)
        self.assertEqual(audit["status"], "fail")
        self.assertTrue(any("injection label" in item for item in audit["failures"]))


if __name__ == "__main__":
    unittest.main()
