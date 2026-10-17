import json
import tempfile
import unittest
from pathlib import Path

from qfabric.recommendation import recommend
from qfabric.recommendation_input import build_recommendation_input


def operations():
    return {
        "schema_version": 1,
        "task": "add",
        "basis": "test",
        "current_domain": "linux",
        "rate_hz": 100,
        "minimum_evidence": 2,
        "cooldown_active": False,
        "admission": {"linux": True, "rt": True},
        "mcu": {"utilization_without_task_pct": 10, "reserved_headroom_pct": 25},
        "chain_edges": [],
    }


def write_stage5_fixture(root: Path) -> None:
    profile = {
        "schema_version": 1,
        "groups": [
            {
                "task": "add",
                "domain": domain,
                "instrumentation": "full",
                "metrics_ns": {
                    "end_to_end": {"p95": p95},
                    "local_execution": {"p95": local},
                },
            }
            for domain, p95, local in (("linux", 8_000, 400), ("rt", 11_000, 300))
        ],
    }
    (root / "profile.json").write_text(json.dumps(profile), encoding="utf-8")
    contract = {"deadline_ns": 20_000, "max_miss_rate_pct": 1}
    for domain in ("linux", "rt"):
        report = {
            "schema_version": 1,
            "contract": contract,
            "state": "SATISFIED",
            "evidence_count": 2,
            "windows": [{"misses": 0}],
        }
        (root / f"{domain}-report.json").write_text(json.dumps(report), encoding="utf-8")


class QFabricRecommendationInputTests(unittest.TestCase):
    def test_builds_input_from_stage5_and_abi_evidence(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_stage5_fixture(root)
            document = build_recommendation_input(
                root, repository / "config/qfabric-abi.json", operations()
            )
        task = document["tasks"][0]
        self.assertEqual(task["effect"], "Q_PURE")
        self.assertFalse(task["transition_hooks_declared"])
        self.assertEqual(task["candidates"]["linux"]["evidence_count"], 2)
        self.assertEqual(task["candidates"]["rt"]["local_execution_p95_ns"], 300)
        self.assertEqual(recommend(document)["records"][0]["recommended_domain"], "linux")

    def test_rejects_mismatched_cross_domain_contracts(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_stage5_fixture(root)
            rt_path = root / "rt-report.json"
            report = json.loads(rt_path.read_text())
            report["contract"]["deadline_ns"] = 30_000
            rt_path.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "do not match"):
                build_recommendation_input(
                    root, repository / "config/qfabric-abi.json", operations()
                )

    def test_rejects_unknown_task_and_ambiguous_profile_group(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_stage5_fixture(root)
            bad_operations = operations()
            bad_operations["task"] = "missing"
            with self.assertRaisesRegex(ValueError, "absent"):
                build_recommendation_input(
                    root, repository / "config/qfabric-abi.json", bad_operations
                )


if __name__ == "__main__":
    unittest.main()
