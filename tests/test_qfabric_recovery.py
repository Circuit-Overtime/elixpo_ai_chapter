import unittest

from qfabric.recovery import (
    RecoveryObservation,
    RecoveryPolicy,
    RecoveryState,
    replay_recovery,
)


def observation(**changes) -> RecoveryObservation:
    values = {
        "source_contract_state": "SATISFIED",
        "evidence_valid": True,
        "recommended_domain": None,
        "semantic_eligible": False,
        "admission_allowed": False,
        "predicted_feasible": False,
        "safe_boundary": False,
        "target_contract_state": None,
        "protected_contracts_healthy": True,
        "transient_misses": 0,
        "alternatives_exhausted": False,
    }
    values.update(changes)
    return RecoveryObservation(**values)


def violation(**changes) -> RecoveryObservation:
    values = {
        "source_contract_state": "VIOLATED",
        "evidence_valid": True,
        "recommended_domain": "rt",
        "semantic_eligible": True,
        "admission_allowed": True,
        "predicted_feasible": True,
    }
    values.update(changes)
    return observation(**values)


class QFabricRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = RecoveryPolicy(
            probation_windows=3,
            probation_max_windows=5,
            cooldown_windows=3,
            blacklist_windows=5,
        )

    def test_noise_and_insufficient_evidence_never_switch(self) -> None:
        report = replay_recovery(
            self.policy,
            [
                observation(source_contract_state="AT_RISK"),
                violation(evidence_valid=False, safe_boundary=True),
                observation(source_contract_state="SATISFIED"),
            ],
            initial_domain="linux",
            initial_epoch=7,
        )
        self.assertEqual(report["final"]["state"], "MONITORING")
        self.assertEqual(report["final"]["domain"], "linux")
        self.assertEqual(report["final"]["epoch"], 7)
        self.assertEqual(report["metrics"]["switch_attempts"], 0)

    def test_effect_admission_and_feasibility_are_hard_gates(self) -> None:
        cases = (
            (violation(semantic_eligible=False), "semantic_ineligible"),
            (violation(admission_allowed=False), "destination_not_admitted"),
            (violation(predicted_feasible=False), "predicted_infeasible"),
        )
        for event, expected_reason in cases:
            with self.subTest(expected_reason):
                report = replay_recovery(
                    self.policy,
                    [event],
                    initial_domain="linux",
                    initial_epoch=1,
                )
                self.assertEqual(report["metrics"]["switch_attempts"], 0)
                self.assertEqual(
                    report["steps"][0]["actions"][0]["reason"], expected_reason
                )

    def test_safe_boundary_probation_and_commit(self) -> None:
        report = replay_recovery(
            self.policy,
            [
                violation(safe_boundary=False),
                violation(safe_boundary=True),
                observation(target_contract_state="SATISFIED"),
                observation(target_contract_state="SATISFIED"),
                observation(target_contract_state="SATISFIED"),
            ],
            initial_domain="linux",
            initial_epoch=10,
        )
        switch = next(
            action
            for step in report["steps"]
            for action in step["actions"]
            if action["type"] == "switch"
        )
        self.assertTrue(switch["safe_boundary"])
        self.assertEqual(switch["epoch"], 11)
        self.assertEqual(report["final"]["domain"], "rt")
        self.assertEqual(report["final"]["state"], "COOLDOWN")
        self.assertEqual(report["metrics"]["commits"], 1)
        self.assertEqual(report["metrics"]["rollbacks"], 0)
        self.assertEqual(report["metrics"]["detection_delay_windows"], [2])
        self.assertEqual(report["metrics"]["verified_recovery_windows"], [5])
        self.assertEqual(report["metrics"]["successful_recovery_rate_pct"], 100.0)

    def test_final_allowed_probation_window_can_commit(self) -> None:
        policy = RecoveryPolicy(
            probation_windows=3,
            probation_max_windows=3,
            cooldown_windows=2,
            blacklist_windows=3,
        )
        report = replay_recovery(
            policy,
            [
                violation(safe_boundary=True),
                observation(target_contract_state="SATISFIED"),
                observation(target_contract_state="SATISFIED"),
                observation(target_contract_state="SATISFIED"),
            ],
            initial_domain="linux",
            initial_epoch=1,
        )
        self.assertEqual(report["metrics"]["commits"], 1)
        self.assertEqual(report["metrics"]["rollbacks"], 0)

    def test_failed_probation_rolls_back_then_blacklists(self) -> None:
        events = [
            violation(safe_boundary=True),
            observation(
                target_contract_state="SATISFIED",
                protected_contracts_healthy=False,
                safe_boundary=False,
                transient_misses=2,
            ),
            observation(safe_boundary=True),
            observation(),
            observation(),
            observation(),
            violation(safe_boundary=True),
        ]
        report = replay_recovery(
            self.policy,
            events,
            initial_domain="linux",
            initial_epoch=3,
        )
        rollback = next(
            action
            for step in report["steps"]
            for action in step["actions"]
            if action["type"] == "rollback"
        )
        self.assertTrue(rollback["safe_boundary"])
        self.assertEqual(rollback["epoch"], 5)
        self.assertEqual(report["final"]["domain"], "linux")
        self.assertEqual(report["metrics"]["rollbacks"], 1)
        self.assertEqual(report["metrics"]["oscillations"], 1)
        self.assertEqual(report["metrics"]["protected_contract_regressions"], 1)
        self.assertEqual(report["metrics"]["transient_misses"], 2)
        final_action = report["steps"][-1]["actions"][0]
        self.assertEqual(final_action["reason"], "candidate_blacklisted")
        self.assertEqual(report["metrics"]["switch_attempts"], 1)

    def test_exhausted_alternatives_become_infeasible_without_oscillation(self) -> None:
        report = replay_recovery(
            self.policy,
            [
                violation(
                    recommended_domain=None,
                    alternatives_exhausted=True,
                    safe_boundary=True,
                ),
                violation(
                    recommended_domain=None,
                    alternatives_exhausted=True,
                    safe_boundary=True,
                ),
            ],
            initial_domain="linux",
            initial_epoch=1,
        )
        self.assertEqual(report["final"]["state"], RecoveryState.INFEASIBLE.value)
        self.assertEqual(report["metrics"]["switch_attempts"], 0)
        self.assertEqual(report["metrics"]["oscillations"], 0)

    def test_replay_is_deterministic(self) -> None:
        events = [
            violation(safe_boundary=True),
            observation(target_contract_state="SATISFIED"),
            observation(target_contract_state="SATISFIED"),
            observation(target_contract_state="SATISFIED"),
        ]
        first = replay_recovery(
            self.policy, events, initial_domain="linux", initial_epoch=1
        )
        second = replay_recovery(
            self.policy, events, initial_domain="linux", initial_epoch=1
        )
        self.assertEqual(first, second)
        self.assertEqual(first["metrics"]["false_switches"], 0)


if __name__ == "__main__":
    unittest.main()
