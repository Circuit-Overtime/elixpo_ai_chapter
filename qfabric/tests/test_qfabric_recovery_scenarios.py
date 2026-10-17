import unittest

from qfabric.recovery_scenarios import run_recovery_scenarios


class QFabricRecoveryScenarioTests(unittest.TestCase):
    def test_complete_fault_injection_suite_passes(self) -> None:
        report = run_recovery_scenarios()
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["scenario_count"], 10)
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["state_coverage"], report["required_states"])
        names = {scenario["name"] for scenario in report["scenarios"]}
        self.assertIn("successful-recovery", names)
        self.assertIn("protected-regression-deferred-rollback", names)
        self.assertIn("alternatives-exhausted", names)
        for scenario in report["scenarios"]:
            self.assertTrue(scenario["passed"], scenario["name"])
            self.assertEqual(
                scenario["provenance"],
                "controlled-fault-injection-not-hardware-performance",
            )
            self.assertTrue(scenario["checks"]["deterministic"])
            self.assertTrue(scenario["checks"]["safe_domain_changes"])
            self.assertTrue(scenario["checks"]["epoch_consistent"])

    def test_aggregate_metrics_cover_required_evaluation(self) -> None:
        metrics = run_recovery_scenarios()["aggregate_metrics"]
        self.assertGreater(metrics["switch_attempts"], 0)
        self.assertGreater(metrics["commits"], 0)
        self.assertGreater(metrics["rollbacks"], 0)
        self.assertEqual(metrics["false_switches"], 0)
        self.assertGreater(metrics["transient_misses"], 0)
        self.assertGreater(metrics["protected_contract_regressions"], 0)
        self.assertGreater(metrics["oscillations"], 0)
        self.assertTrue(metrics["detection_delay_windows"])
        self.assertTrue(metrics["verified_recovery_windows"])
        self.assertIsNotNone(metrics["successful_recovery_rate_pct"])
        self.assertIsNotNone(metrics["rollback_rate_pct"])


if __name__ == "__main__":
    unittest.main()
