import copy
import unittest

from qfabric.recommendation import recommend
from qfabric.recovery_evidence import derive_recovery_evidence
from tests.test_qfabric_recommendation import recommendation_input


def contract(state="SATISFIED", evidence=1000):
    return {"schema_version": 1, "state": state, "evidence_count": evidence}


class QFabricRecoveryEvidenceTests(unittest.TestCase):
    def test_healthy_measured_evidence_does_not_arm_an_alternate(self) -> None:
        recommendation = recommend(recommendation_input())
        evidence = derive_recovery_evidence(
            contract(), recommendation, task="filter", safe_boundary=True
        )
        observation = evidence["observation"]
        self.assertEqual(observation["source_contract_state"], "SATISFIED")
        self.assertIsNone(observation["recommended_domain"])
        self.assertFalse(observation["alternatives_exhausted"])

    def test_violated_source_and_selected_rt_preserve_all_gates(self) -> None:
        source = recommendation_input()
        task = source["tasks"][0]
        task["candidates"]["linux"]["contract_state"] = "VIOLATED"
        task["candidates"]["rt"]["end_to_end_p95_ns"] = 1_000_000
        recommendation = recommend(source)
        evidence = derive_recovery_evidence(
            contract("VIOLATED"),
            recommendation,
            task="filter",
            safe_boundary=True,
            target_contract=contract("SATISFIED"),
        )
        observation = evidence["observation"]
        self.assertEqual(observation["recommended_domain"], "rt")
        self.assertTrue(observation["semantic_eligible"])
        self.assertTrue(observation["admission_allowed"])
        self.assertTrue(observation["predicted_feasible"])
        self.assertEqual(observation["target_contract_state"], "SATISFIED")

    def test_mismatched_state_or_evidence_is_rejected(self) -> None:
        recommendation = recommend(recommendation_input())
        with self.assertRaisesRegex(ValueError, "state does not match"):
            derive_recovery_evidence(
                contract("VIOLATED"), recommendation, task="filter", safe_boundary=False
            )
        with self.assertRaisesRegex(ValueError, "count does not match"):
            derive_recovery_evidence(
                contract(evidence=999), recommendation, task="filter", safe_boundary=False
            )

    def test_transient_rejection_does_not_claim_infeasible(self) -> None:
        source = recommendation_input()
        task = source["tasks"][0]
        task["candidates"]["linux"]["contract_state"] = "VIOLATED"
        source["policy"]["cooldown_active"] = True
        recommendation = recommend(source)
        evidence = derive_recovery_evidence(
            contract("VIOLATED"), recommendation, task="filter", safe_boundary=True
        )
        self.assertFalse(evidence["observation"]["alternatives_exhausted"])

    def test_permanent_rejection_can_mark_alternatives_exhausted(self) -> None:
        source = recommendation_input()
        task = source["tasks"][0]
        task["candidates"]["linux"]["contract_state"] = "VIOLATED"
        task["candidates"]["rt"]["admission_allowed"] = False
        recommendation = recommend(source)
        evidence = derive_recovery_evidence(
            contract("VIOLATED"), recommendation, task="filter", safe_boundary=True
        )
        self.assertTrue(evidence["observation"]["alternatives_exhausted"])
        self.assertIn(
            "destination_not_admitted",
            evidence["destination"]["alternate_rejection_reasons"],
        )

    def test_record_selection_is_exact(self) -> None:
        recommendation = recommend(recommendation_input())
        duplicated = copy.deepcopy(recommendation["records"][0])
        recommendation["records"].append(duplicated)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            derive_recovery_evidence(
                contract(), recommendation, task="filter", safe_boundary=False
            )


if __name__ == "__main__":
    unittest.main()
