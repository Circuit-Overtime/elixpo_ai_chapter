import copy
import unittest

from qfabric.recommendation import recommend, render_recommendation


def recommendation_input():
    return {
        "schema_version": 1,
        "policy": {"minimum_evidence": 100, "cooldown_active": False},
        "mcu": {"utilization_without_task_pct": 20, "reserved_headroom_pct": 25},
        "tasks": [
            {
                "name": "filter",
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


def reason_codes(record, domain):
    candidate = next(item for item in record["candidates"] if item["domain"] == domain)
    return [reason["code"] for reason in candidate["rejection_reasons"]]


class QFabricRecommendationTests(unittest.TestCase):
    def test_faster_mcu_compute_loses_when_total_rpc_is_slower(self) -> None:
        report = recommend(recommendation_input())
        record = report["records"][0]
        self.assertEqual(record["recommended_domain"], "linux")
        self.assertIn("higher_predicted_end_to_end", reason_codes(record, "rt"))
        self.assertLess(
            record["candidates"][1]["local_execution_p95_ns"],
            record["candidates"][0]["local_execution_p95_ns"],
        )

    def test_insufficient_evidence_withholds_recommendation(self) -> None:
        source = recommendation_input()
        source["tasks"][0]["candidates"]["rt"]["evidence_count"] = 99
        record = recommend(source)["records"][0]
        self.assertEqual(record["status"], "withheld")
        self.assertIsNone(record["recommended_domain"])
        self.assertIn("insufficient_evidence", reason_codes(record, "rt"))

    def test_admission_and_effect_gates_explain_rejection(self) -> None:
        source = recommendation_input()
        task = source["tasks"][0]
        task["candidates"]["rt"]["end_to_end_p95_ns"] = 1_000_000
        task["candidates"]["rt"]["admission_allowed"] = False
        record = recommend(source)["records"][0]
        self.assertEqual(record["recommended_domain"], "linux")
        self.assertIn("destination_not_admitted", reason_codes(record, "rt"))

        task["candidates"]["rt"]["admission_allowed"] = True
        task["effect"] = "Q_STATEFUL"
        record = recommend(source)["records"][0]
        self.assertEqual(record["recommended_domain"], "linux")
        self.assertIn("semantic_ineligible", reason_codes(record, "rt"))

    def test_chain_cost_prevents_linux_rt_linux_ping_pong(self) -> None:
        source = recommendation_input()
        task = source["tasks"][0]
        task["candidates"]["linux"]["end_to_end_p95_ns"] = 9_000_000
        task["candidates"]["rt"]["end_to_end_p95_ns"] = 8_000_000
        task["chain_edges"] = [
            {"neighbor": "decode", "neighbor_domain": "linux", "boundary_cost_ns": 1_000_000},
            {"neighbor": "encode", "neighbor_domain": "linux", "boundary_cost_ns": 1_000_000},
        ]
        record = recommend(source)["records"][0]
        self.assertEqual(record["recommended_domain"], "linux")
        rt = next(item for item in record["candidates"] if item["domain"] == "rt")
        self.assertEqual(rt["chain_boundary_cost_ns"], 2_000_000)

    def test_cooldown_and_headroom_are_hard_gates(self) -> None:
        source = recommendation_input()
        source["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = 1_000_000
        source["policy"]["cooldown_active"] = True
        record = recommend(source)["records"][0]
        self.assertIn("cooldown_active", reason_codes(record, "rt"))

        source["policy"]["cooldown_active"] = False
        source["mcu"]["utilization_without_task_pct"] = 74.99
        source["tasks"][0]["rate_hz"] = 1_000_000
        source["tasks"][0]["candidates"]["rt"]["local_execution_p95_ns"] = 1_000
        record = recommend(source)["records"][0]
        self.assertIn("mcu_headroom_exceeded", reason_codes(record, "rt"))

    def test_identical_input_is_deterministic_and_never_changes_placement(self) -> None:
        source = recommendation_input()
        first = recommend(copy.deepcopy(source))
        second = recommend(copy.deepcopy(source))
        self.assertEqual(first, second)
        self.assertTrue(first["advisory_only"])
        self.assertEqual(first["placement_changes"], 0)
        self.assertFalse(first["records"][0]["placement_changed"])
        self.assertIn("advisory only", render_recommendation(first))

    def test_task_filter_is_exact(self) -> None:
        source = recommendation_input()
        second = copy.deepcopy(source["tasks"][0])
        second["name"] = "control"
        source["tasks"].append(second)
        report = recommend(source, task_filter="filter")
        self.assertEqual([record["task"] for record in report["records"]], ["filter"])
        with self.assertRaisesRegex(ValueError, "not found"):
            recommend(source, task_filter="missing")


if __name__ == "__main__":
    unittest.main()
