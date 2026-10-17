import copy
import unittest
from unittest.mock import patch

from qfabric.recovery_closed_loop import run_hardware_recovery
from qfabric.recovery_runtime import ExecutionSample, ExecutionWindow


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
                    "linux": {
                        "evidence_count": 1000,
                        "end_to_end_p95_ns": 8_000_000,
                        "local_execution_p95_ns": 4_000,
                        "observed_miss_rate_pct": 0,
                        "contract_state": "SATISFIED",
                        "admission_allowed": True,
                    },
                    "rt": {
                        "evidence_count": 1000,
                        "end_to_end_p95_ns": 11_000_000,
                        "local_execution_p95_ns": 300,
                        "observed_miss_rate_pct": 0,
                        "contract_state": "SATISFIED",
                        "admission_allowed": True,
                    },
                },
            }
        ],
    }


class FakeHardwareBackend:
    failure_windows: set[int] = set()
    instances = []

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
        self.transitions = []
        self.closed = False
        self.__class__.instances.append(self)

    def execute_window(self, window_index):
        latency_ns = 30_000_000 if window_index in self.failure_windows else 10_000_000
        return ExecutionWindow(
            window_index=window_index,
            domain=self.placement_domain,
            epoch=self.epoch,
            samples=tuple(
                ExecutionSample("ok", latency_ns)
                for _ in range(self.invocations_per_window)
            ),
            protected_contracts_healthy=True,
            in_flight_after=0,
        )

    def transition(self, domain, epoch):
        if domain == self.placement_domain or epoch != self.epoch + 1:
            raise AssertionError("invalid transition")
        self.transitions.append((domain, epoch))
        self.placement_domain = domain
        self.epoch = epoch

    def close(self):
        self.closed = True


class QFabricClosedLoopRecoveryTests(unittest.TestCase):
    def setUp(self):
        FakeHardwareBackend.instances = []

    def run_campaign(self, mode, failure_windows):
        FakeHardwareBackend.failure_windows = set(failure_windows)
        with patch(
            "qfabric.recovery_closed_loop.DualDomainAddBackend",
            FakeHardwareBackend,
        ):
            return run_hardware_recovery(
                root=None,
                address="unused",
                recommendation_input=copy.deepcopy(recommendation_input()),
                mode=mode,
                task="add",
                initial_epoch=7,
                invocations_per_window=4,
            )

    def test_success_campaign_switches_and_commits_at_safe_boundaries(self):
        report = self.run_campaign("success", {1, 2, 3})
        backend = FakeHardwareBackend.instances[0]
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["observed"]["final_domain"], "rt")
        self.assertEqual(report["observed"]["commits"], 1)
        self.assertEqual(backend.transitions, [("rt", 8)])
        self.assertTrue(backend.closed)
        self.assertEqual(report["runtime"]["window_count"], 9)

    def test_rollback_campaign_restores_origin_and_advances_epoch(self):
        report = self.run_campaign("rollback", {1, 2, 3, 4, 5, 6})
        backend = FakeHardwareBackend.instances[0]
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["observed"]["final_domain"], "linux")
        self.assertEqual(report["observed"]["rollbacks"], 1)
        self.assertEqual(backend.transitions, [("rt", 8), ("linux", 9)])
        self.assertTrue(all(report["checks"].values()))

    def test_rejects_invalid_bounded_campaign_configuration(self):
        arguments = {
            "root": None,
            "address": "unused",
            "recommendation_input": recommendation_input(),
            "mode": "success",
            "task": "add",
            "initial_epoch": 1,
        }
        for field, value in (
            ("initial_epoch", -1),
            ("invocations_per_window", 0),
            ("deadline_ns", 0),
            ("injected_delay_ns", 0),
        ):
            case_arguments = dict(arguments)
            case_arguments[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                run_hardware_recovery(**case_arguments)


if __name__ == "__main__":
    unittest.main()
