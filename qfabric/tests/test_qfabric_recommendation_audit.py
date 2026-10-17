import json
import tempfile
import unittest
from pathlib import Path

from qfabric.recommendation import recommend, write_recommendation
from qfabric.recommendation_audit import audit_stage6
from qfabric.recommendation_input import (
    build_recommendation_input,
    write_recommendation_input,
)
from qfabric.recommendation_scenarios import (
    run_recommendation_scenarios,
    write_scenario_suite,
)
from tests.test_qfabric_recommendation_input import operations, write_stage5_fixture


def make_stage6_evidence(
    root: Path, stage5_root: Path, abi_path: Path, operations_path: Path
) -> None:
    source = build_recommendation_input(
        stage5_root,
        abi_path,
        json.loads(operations_path.read_text()),
    )
    write_recommendation_input(source, root / "recommendation-input.json")
    write_recommendation(recommend(source), root / "recommendations.json")
    task = source["tasks"][0]["name"]
    write_recommendation(
        recommend(source, task_filter=task), root / "filtered-recommendation.json"
    )
    write_scenario_suite(
        run_recommendation_scenarios(source), root / "recommendation-scenarios.json"
    )


class QFabricRecommendationAuditTests(unittest.TestCase):
    def test_complete_stage6_evidence_passes(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        abi = repository / "config/qfabric-abi.json"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            stage5 = temporary / "stage5"
            stage6 = temporary / "stage6"
            stage5.mkdir()
            stage6.mkdir()
            write_stage5_fixture(stage5)
            operations_path = temporary / "operations.json"
            operations_path.write_text(json.dumps(operations()), encoding="utf-8")
            make_stage6_evidence(stage6, stage5, abi, operations_path)
            report = audit_stage6(stage6, stage5, abi, operations_path)
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["scenario_count"], 11)
        self.assertTrue(report["deterministic"])
        self.assertTrue(report["advisory_only"])
        self.assertEqual(report["placement_changes"], 0)

    def test_tampered_report_and_source_input_fail(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        abi = repository / "config/qfabric-abi.json"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            stage5 = temporary / "stage5"
            stage6 = temporary / "stage6"
            stage5.mkdir()
            stage6.mkdir()
            write_stage5_fixture(stage5)
            operations_path = temporary / "operations.json"
            operations_path.write_text(json.dumps(operations()), encoding="utf-8")
            make_stage6_evidence(stage6, stage5, abi, operations_path)

            input_path = stage6 / "recommendation-input.json"
            source = json.loads(input_path.read_text())
            source["tasks"][0]["rate_hz"] = 999
            input_path.write_text(json.dumps(source), encoding="utf-8")
            report_path = stage6 / "recommendations.json"
            recommendation = json.loads(report_path.read_text())
            recommendation["placement_changes"] = 1
            report_path.write_text(json.dumps(recommendation), encoding="utf-8")
            report = audit_stage6(stage6, stage5, abi, operations_path)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("input does not match" in item for item in report["failures"]))
        self.assertTrue(any("not deterministic" in item for item in report["failures"]))


if __name__ == "__main__":
    unittest.main()
