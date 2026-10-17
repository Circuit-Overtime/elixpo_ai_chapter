import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.evaluation import (
    _simulate,
    derive_deadline,
    probe_scheduler_environment,
)


class QFabricEvaluationTests(unittest.TestCase):
    def test_deadline_is_derived_from_all_stage1_repetitions(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for index, p99 in enumerate((9_000_000, 13_664_374, 9_500_000)):
                path = Path(directory) / f"{index}.json"
                path.write_text(
                    json.dumps(
                        {
                            "groups": [
                                {
                                    "experiment": "rpc-roundtrip",
                                    "p99_ns": p99,
                                }
                            ]
                        }
                    ),
                    encoding="utf-8",
                )
                paths.append(path)
            result = derive_deadline(paths)
        self.assertEqual(result["deadline_ns"], 20_000_000)
        self.assertFalse(result["post_hoc_tuned"])
        self.assertEqual(len(result["source_values_ns"]), 3)

    def test_deadline_rejects_incomplete_repetition_set(self):
        with self.assertRaisesRegex(ValueError, "three Stage 1 repetitions"):
            derive_deadline([])

    def test_offline_oracle_is_not_worse_than_fixed_placement_on_paired_trace(self):
        app = {
            "name": "chain",
            "nodes": [
                {"linux_only": False},
                {"linux_only": False},
            ],
            "manual_expert": ["linux", "rt"],
        }
        arguments = {
            "linux": [30, 40, 50],
            "rt": [10, 20, 30],
            "tuned": None,
            "boundary_ns": 5,
            "per_node_deadline_ns": 100,
            "observations": 100,
            "seed": 42,
            "loaded": False,
            "recovery_switch_observation": 60,
        }
        fixed = _simulate(app, "ordinary-linux", **arguments)
        oracle = _simulate(app, "offline-oracle", **arguments)
        self.assertLessEqual(oracle["p95_ns"], fixed["p95_ns"])
        self.assertEqual(oracle["seed"], fixed["seed"])

    def test_scheduler_probe_reports_active_fifo_without_assuming_preempt_rt(self):
        with (
            patch("os.sched_getscheduler", return_value=1),
            patch("os.sched_getparam") as get_parameter,
            patch("pathlib.Path.read_text", return_value="CONFIG_PREEMPT=y\n"),
        ):
            get_parameter.return_value.sched_priority = 50
            result = probe_scheduler_environment()
        self.assertTrue(result["sched_fifo"]["available"])
        self.assertEqual(result["sched_fifo"]["priority"], 50)
        self.assertFalse(result["preempt_rt"]["available"])


if __name__ == "__main__":
    unittest.main()
