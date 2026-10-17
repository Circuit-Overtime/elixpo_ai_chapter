import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from qfabric.decision_history import GENESIS_SHA256, DecisionStore


class SteppingClock:
    def __init__(self):
        self.value = datetime(2026, 10, 9, 8, 0, tzinfo=UTC)

    def __call__(self):
        captured = self.value
        self.value += timedelta(seconds=1)
        return captured


class QFabricDecisionHistoryTests(unittest.TestCase):
    def append(self, store, *, task="add", outcome=None):
        return store.append(
            kind="recommendation",
            task=task,
            policy_name="gated-static-end-to-end",
            policy_version=1,
            decision_input={"evidence": [1, 2, 3]},
            outcome=outcome or {"selected": "linux", "rejected": ["rt"]},
            facts={"deadline_ns": 20_000_000},
        )

    def test_records_survive_restart_with_stable_contiguous_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "decisions.jsonl"
            first_store = DecisionStore(path, clock=SteppingClock())
            first = self.append(first_store)
            second = self.append(first_store, task="filter")

            restarted = DecisionStore(path)
            self.assertEqual(restarted.get(1), first)
            self.assertEqual(restarted.latest("filter"), second)
            self.assertEqual(first["decision_id"], 1)
            self.assertEqual(second["decision_id"], 2)
            self.assertEqual(first["previous_record_sha256"], GENESIS_SHA256)
            self.assertEqual(second["previous_record_sha256"], first["record_sha256"])

    def test_append_freezes_mutable_inputs(self):
        source = {"samples": [1]}
        with tempfile.TemporaryDirectory() as directory:
            store = DecisionStore(Path(directory) / "decisions.jsonl")
            record = store.append(
                kind="recovery",
                task="add",
                policy_name="safe-recovery",
                policy_version=1,
                decision_input=source,
                outcome={"action": "rollback"},
                facts={},
            )
            source["samples"].append(2)
            record["input"]["samples"].append(3)
            self.assertEqual(store.get(1)["input"], {"samples": [1]})

    def test_modified_record_breaks_integrity_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "decisions.jsonl"
            store = DecisionStore(path)
            self.append(store)
            record = json.loads(path.read_text())
            record["outcome"]["selected"] = "rt"
            path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "modified"):
                store.load()

    def test_truncated_tail_is_rejected_instead_of_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "decisions.jsonl"
            store = DecisionStore(path)
            self.append(store)
            path.write_text(path.read_text().rstrip("\n"), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "truncated"):
                store.load()

    def test_rejects_invalid_record_metadata_and_lookup(self):
        with tempfile.TemporaryDirectory() as directory:
            store = DecisionStore(Path(directory) / "decisions.jsonl")
            with self.assertRaises(ValueError):
                store.append(
                    kind="invalid",
                    task="add",
                    policy_name="policy",
                    policy_version=1,
                    decision_input={},
                    outcome={},
                    facts={},
                )
            with self.assertRaisesRegex(ValueError, "not found"):
                store.get(1)


if __name__ == "__main__":
    unittest.main()
