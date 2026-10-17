import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

from qfabric.cli import main
from qfabric.decision_audit import audit_stage8
from qfabric.decision_campaign import (
    REQUIRED_CLASSIFICATIONS,
    run_decision_campaign,
    write_decision_campaign,
)
from qfabric.decision_history import DecisionStore
from qfabric.decision_records import (
    record_hardware_recovery,
    record_recommendation,
    replay_decision,
)
from qfabric.recommendation import recommend
from qfabric.recovery import RecoveryObservation, RecoveryPolicy, replay_recovery


def recommendation_input():
    return {
        "schema_version": 1,
        "policy": {"minimum_evidence": 100, "cooldown_active": False},
        "mcu": {"utilization_without_task_pct": 20, "reserved_headroom_pct": 25},
        "tasks": [
            {
                "name": "add",
                "effect": "Q_PURE",
                "current_domain": "linux",
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


def hardware_report(source):
    policy = RecoveryPolicy(
        probation_windows=1,
        probation_max_windows=2,
        cooldown_windows=1,
        blacklist_windows=2,
    )
    observations = [
        RecoveryObservation(
            source_contract_state="VIOLATED",
            evidence_valid=True,
            recommended_domain="rt",
            semantic_eligible=True,
            admission_allowed=True,
            predicted_feasible=True,
            safe_boundary=True,
        ),
        RecoveryObservation(
            source_contract_state="VIOLATED",
            evidence_valid=True,
            safe_boundary=True,
            target_contract_state="VIOLATED",
            transient_misses=1,
        ),
    ]
    recovery = replay_recovery(
        policy, observations, initial_domain="linux", initial_epoch=9
    )
    recommendation = recommend(source, task_filter="add")
    contract = {
        "deadline_ns": 20_000_000,
        "window_size": 1,
        "minimum_samples": 1,
        "warmup_samples": 0,
        "max_miss_rate_pct": 1,
        "at_risk_miss_rate_pct": 0.5,
        "recovery_miss_rate_pct": 0.25,
        "violation_windows": 1,
        "recovery_windows": 1,
        "infeasible_windows": 2,
    }
    decisions = []
    windows = []
    for index, step in enumerate(recovery["steps"], start=1):
        decisions.append(
            {
                "window_index": index,
                "domain": step["before"]["domain"],
                "contract": {
                    "window_index": index,
                    "state_before": "SATISFIED",
                    "state_after": "VIOLATED",
                    "sample_count": 1,
                    "misses": 1,
                    "miss_rate_pct": 100.0,
                    "confidence": {"method": "wilson-score"},
                },
                "recommendation": copy.deepcopy(recommendation),
                "observation": step["observation"],
            }
        )
        windows.append(
            {
                "execution": {
                    "window_index": index,
                    "domain": step["before"]["domain"],
                    "epoch": step["before"]["epoch"],
                    "samples": [{"outcome": "ok", "latency_ns": 30_000_000}],
                    "safe_boundary": True,
                }
            }
        )
    return {
        "configuration": {"task": "add", "initial_epoch": 9},
        "evidence": {"contract": contract, "decisions": decisions},
        "runtime": {"recovery": recovery, "windows": windows},
    }


class QFabricDecisionRecordTests(unittest.TestCase):
    def test_recommendation_record_preserves_explanation_and_replays(self):
        with tempfile.TemporaryDirectory() as directory:
            store = DecisionStore(Path(directory) / "decisions.jsonl")
            record = record_recommendation(store, recommendation_input(), task="add")
            replay = replay_decision(record)
        self.assertEqual(replay["status"], "pass")
        self.assertIn("excessive_rpc_cost", record["facts"]["decision"]["classifications"])
        candidates = {item["domain"]: item for item in record["facts"]["candidates"]}
        self.assertEqual(candidates["rt"]["costs_ns"]["communication_p95"], 10_999_700)
        self.assertEqual(record["facts"]["thresholds"]["minimum_evidence"], 100)

    def test_recovery_records_replay_each_prefix_and_explain_rollback(self):
        source = recommendation_input()
        with tempfile.TemporaryDirectory() as directory:
            store = DecisionStore(Path(directory) / "decisions.jsonl")
            records = record_hardware_recovery(store, hardware_report(source), source)
            restarted = DecisionStore(store.path)
            replays = [replay_decision(record) for record in restarted.load()]
        self.assertEqual(len(records), 2)
        self.assertTrue(all(item["matches"] for item in replays))
        self.assertEqual(records[1]["facts"]["rollback_condition"], "target_contract_failure")
        self.assertIn(
            "failed_probation", records[1]["facts"]["decision"]["classifications"]
        )
        self.assertEqual(records[1]["outcome"]["after"]["domain"], "linux")

    def test_tampered_recovery_report_is_rejected_before_recording(self):
        source = recommendation_input()
        report = hardware_report(source)
        report["runtime"]["recovery"]["final"]["domain"] = "rt"
        with tempfile.TemporaryDirectory() as directory:
            store = DecisionStore(Path(directory) / "decisions.jsonl")
            with self.assertRaisesRegex(ValueError, "does not replay"):
                record_hardware_recovery(store, report, source)
            self.assertEqual(store.load(), [])

    def test_required_explain_and_replay_interfaces_use_persisted_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = root / "recommendation.json"
            history_path = root / "decisions.jsonl"
            source_path.write_text(json.dumps(recommendation_input()), encoding="utf-8")

            recorded = io.StringIO()
            with contextlib.redirect_stdout(recorded):
                status = main(
                    [
                        "history",
                        "recommendation",
                        "--input",
                        str(source_path),
                        "--task",
                        "add",
                        "--store",
                        str(history_path),
                    ]
                )
            self.assertEqual(status, 0)
            self.assertIn("decision 1", recorded.getvalue())

            human = io.StringIO()
            with contextlib.redirect_stdout(human):
                status = main(["explain", "add", "--history", str(history_path)])
            self.assertEqual(status, 0)
            self.assertIn("QFabric decision 1", human.getvalue())
            self.assertIn("facts.candidates[1].costs_ns.communication_p95", human.getvalue())

            machine = io.StringIO()
            with contextlib.redirect_stdout(machine):
                status = main(
                    [
                        "explain",
                        "add",
                        "--decision",
                        "1",
                        "--history",
                        str(history_path),
                        "--json",
                    ]
                )
            self.assertEqual(status, 0)
            explanation = json.loads(machine.getvalue())
            self.assertEqual(explanation["decision_id"], 1)
            self.assertEqual(explanation["facts"]["decision"]["selected_domain"], "linux")

            replayed = io.StringIO()
            with contextlib.redirect_stdout(replayed):
                status = main(
                    [
                        "replay",
                        "--decision",
                        "1",
                        "--history",
                        str(history_path),
                        "--json",
                    ]
                )
            self.assertEqual(status, 0)
            self.assertTrue(json.loads(replayed.getvalue())["matches"])

    def test_stage8_campaign_covers_all_required_outcomes_after_restart(self):
        source = recommendation_input()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store_path = root / "decisions.jsonl"
            report = run_decision_campaign(
                store_path,
                source,
                hardware_report(source),
            )
            restarted = DecisionStore(store_path)
            records = restarted.load()
            self.assertEqual(report["status"], "pass")
            self.assertEqual(set(report["coverage"]), REQUIRED_CLASSIFICATIONS)
            self.assertTrue(all(report["coverage"].values()))
            self.assertEqual(len(records), report["record_count"])
            self.assertTrue(all(report["checks"].values()))
            with self.assertRaisesRegex(ValueError, "empty decision history"):
                run_decision_campaign(store_path, source, hardware_report(source))

    def test_stage8_audit_regenerates_payloads_and_detects_report_tampering(self):
        source = recommendation_input()
        rollback = hardware_report(source)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store_path = root / "decisions.jsonl"
            campaign_path = root / "campaign.json"
            campaign = run_decision_campaign(store_path, source, rollback)
            write_decision_campaign(campaign, campaign_path)

            audit = audit_stage8(store_path, campaign_path, source, rollback)
            self.assertEqual(audit["status"], "pass")
            self.assertTrue(all(audit["checks"].values()))

            campaign["record_count"] += 1
            write_decision_campaign(campaign, campaign_path)
            audit = audit_stage8(store_path, campaign_path, source, rollback)
            self.assertEqual(audit["status"], "fail")
            self.assertIn(
                "campaign report does not match regenerated evidence",
                audit["failures"],
            )


if __name__ == "__main__":
    unittest.main()
