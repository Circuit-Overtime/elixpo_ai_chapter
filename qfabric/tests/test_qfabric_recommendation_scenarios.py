import unittest

from qfabric.recommendation_scenarios import run_recommendation_scenarios
from tests.test_qfabric_recommendation import recommendation_input


class QFabricRecommendationScenarioTests(unittest.TestCase):
    def test_complete_positive_and_negative_suite_passes(self) -> None:
        report = run_recommendation_scenarios(recommendation_input())
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["scenario_count"], 11)
        self.assertEqual(report["failures"], [])
        names = {scenario["name"] for scenario in report["scenarios"]}
        self.assertEqual(
            names,
            {
                "measured-end-to-end",
                "rt-positive",
                "insufficient-evidence",
                "rt-inadmissible",
                "effect-ineligible",
                "chain-ping-pong",
                "cooldown",
                "mcu-headroom",
                "contract-at-risk",
                "observed-miss-rate",
                "predicted-deadline-miss",
            },
        )
        for scenario in report["scenarios"]:
            self.assertTrue(scenario["passed"], scenario["name"])
            self.assertTrue(scenario["checks"]["deterministic"])
            self.assertTrue(scenario["checks"]["advisory_only"])

    def test_requires_exactly_one_base_task(self) -> None:
        source = recommendation_input()
        source["tasks"].append(source["tasks"][0].copy())
        with self.assertRaisesRegex(ValueError, "exactly one"):
            run_recommendation_scenarios(source)


if __name__ == "__main__":
    unittest.main()
