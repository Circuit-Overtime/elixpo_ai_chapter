import unittest

from qfabric.recovery import RecoveryController, RecoveryObservation, RecoveryPolicy
from qfabric.recovery_runtime import (
    ExecutionSample,
    ExecutionWindow,
    RecoveryExecutor,
)


class FakeBackend:
    def __init__(self):
        self.placement_domain = "linux"
        self.epoch = 1
        self.closed = False
        self.transition_log = []

    def execute_window(self, window_index):
        return ExecutionWindow(
            window_index=window_index,
            domain=self.placement_domain,
            epoch=self.epoch,
            samples=(ExecutionSample("ok", 100),),
            protected_contracts_healthy=True,
            in_flight_after=0,
        )

    def transition(self, domain, epoch):
        self.transition_log.append((domain, epoch))
        self.placement_domain = domain
        self.epoch = epoch

    def close(self):
        self.closed = True


def policy():
    return RecoveryPolicy(
        probation_windows=2,
        probation_max_windows=3,
        cooldown_windows=2,
        blacklist_windows=3,
    )


class QFabricRecoveryRuntimeTests(unittest.TestCase):
    def test_executor_applies_switch_and_commit_only_between_windows(self) -> None:
        backend = FakeBackend()
        controller = RecoveryController(policy(), initial_domain="linux", initial_epoch=1)

        def evidence(window, recovery):
            if window.window_index == 1:
                return RecoveryObservation(
                    source_contract_state="VIOLATED",
                    evidence_valid=True,
                    recommended_domain="rt",
                    semantic_eligible=True,
                    admission_allowed=True,
                    predicted_feasible=True,
                    safe_boundary=window.safe_boundary,
                )
            return RecoveryObservation(
                source_contract_state="VIOLATED",
                evidence_valid=True,
                safe_boundary=window.safe_boundary,
                target_contract_state="SATISFIED",
            )

        report = RecoveryExecutor(controller, backend, evidence).run(3)
        self.assertTrue(backend.closed)
        self.assertEqual(backend.transition_log, [("rt", 2)])
        self.assertEqual(report["recovery"]["metrics"]["commits"], 1)
        self.assertEqual(report["recovery"]["final"]["domain"], "rt")
        self.assertTrue(report["transitions"][0]["safe_boundary"])
        self.assertEqual(report["windows"][1]["execution"]["domain"], "rt")

    def test_executor_applies_epoch_controlled_rollback(self) -> None:
        backend = FakeBackend()
        controller = RecoveryController(policy(), initial_domain="linux", initial_epoch=1)

        def evidence(window, recovery):
            if window.window_index == 1:
                return RecoveryObservation(
                    source_contract_state="VIOLATED",
                    evidence_valid=True,
                    recommended_domain="rt",
                    semantic_eligible=True,
                    admission_allowed=True,
                    predicted_feasible=True,
                    safe_boundary=True,
                )
            return RecoveryObservation(
                source_contract_state="VIOLATED",
                evidence_valid=True,
                safe_boundary=True,
                target_contract_state="VIOLATED",
                transient_misses=1,
            )

        report = RecoveryExecutor(controller, backend, evidence).run(2)
        self.assertEqual(backend.transition_log, [("rt", 2), ("linux", 3)])
        self.assertEqual(report["recovery"]["metrics"]["rollbacks"], 1)
        self.assertEqual(report["recovery"]["final"]["domain"], "linux")

    def test_executor_rejects_boundary_disagreement_and_closes_backend(self) -> None:
        backend = FakeBackend()
        controller = RecoveryController(policy(), initial_domain="linux", initial_epoch=1)

        def unsafe_evidence(window, recovery):
            return RecoveryObservation(
                source_contract_state="SATISFIED",
                evidence_valid=True,
                safe_boundary=False,
            )

        with self.assertRaisesRegex(RuntimeError, "disagrees"):
            RecoveryExecutor(controller, backend, unsafe_evidence).run(1)
        self.assertTrue(backend.closed)

    def test_executor_rejects_initial_epoch_or_domain_divergence(self) -> None:
        backend = FakeBackend()
        controller = RecoveryController(policy(), initial_domain="rt", initial_epoch=1)
        with self.assertRaisesRegex(ValueError, "domains do not match"):
            RecoveryExecutor(controller, backend, lambda window, recovery: None)


if __name__ == "__main__":
    unittest.main()
