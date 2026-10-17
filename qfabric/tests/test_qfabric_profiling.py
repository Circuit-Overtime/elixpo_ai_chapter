import json
import math
import tempfile
import unittest
from pathlib import Path

from qfabric.profiling import (
    Instrumentation,
    InvocationSequencer,
    ProfileCollector,
    ProfileSample,
    load_profile,
    render_status,
    summarize_metric,
    write_profile,
)


def sample(invocation_id, latency, *, domain="rt", deadline=200, local=2):
    return ProfileSample(
        task="add",
        task_id=1,
        invocation_id=invocation_id,
        epoch=7,
        domain=domain,
        instrumentation=Instrumentation.FULL,
        outcome="ok",
        linux_started_ns=1_000,
        linux_finished_ns=1_000 + latency,
        local_execution_ns=local,
        communication_ns=latency - local - 1,
        queueing_ns=1,
        deadline_ns=deadline,
        deadline_met=latency <= deadline,
        mcu_execution_us=local // 1_000,
    )


class QFabricProfilingTests(unittest.TestCase):
    def test_unique_epoch_scoped_invocation_ids(self) -> None:
        sequencer = InvocationSequencer(7)
        self.assertEqual(sequencer.next(), (7 << 32) | 1)
        self.assertEqual(sequencer.next(), (7 << 32) | 2)

    def test_summary_percentiles_and_jitter(self) -> None:
        collector = ProfileCollector(capacity=10, warmup=1, minimum_samples=3)
        for index, latency in enumerate((50, 100, 200, 400), 1):
            collector.add(sample(index, latency))
        group = collector.report()["groups"][0]
        self.assertEqual(group["invocation_count"], 4)
        self.assertEqual(group["window"]["warmup_observed"], 1)
        self.assertTrue(group["window"]["estimator_valid"])
        self.assertEqual(group["metrics_ns"]["end_to_end"]["mean"], 700 / 3)
        self.assertEqual(group["metrics_ns"]["end_to_end"]["maximum"], 400)
        self.assertEqual(group["metrics_ns"]["jitter"]["count"], 2)
        self.assertEqual(group["deadline"]["misses"], 1)
        self.assertFalse(group["clock_semantics"]["cross_clock_subtraction"])
        independent_mean = sum(row["end_to_end_ns"] for row in group["samples"]) / len(
            group["samples"]
        )
        self.assertEqual(group["metrics_ns"]["end_to_end"]["mean"], independent_mean)

    def test_cold_start_drops_and_duplicate_ids_are_visible(self) -> None:
        collector = ProfileCollector(capacity=2, warmup=2, minimum_samples=2)
        collector.add(sample(1, 10))
        report = collector.report()["groups"][0]
        self.assertEqual(report["window"]["invalid_reason"], "warmup-incomplete")
        collector.add(sample(2, 20))
        collector.add(sample(3, 30))
        self.assertEqual(
            collector.report()["groups"][0]["window"]["invalid_reason"],
            "insufficient-samples",
        )
        collector.add(sample(4, 40))
        collector.add(sample(5, 50))
        final = collector.report()["groups"][0]
        self.assertEqual(final["window"]["dropped_samples"], 1)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            collector.add(sample(5, 60))

    def test_stable_json_and_human_status_share_one_report(self) -> None:
        collector = ProfileCollector(capacity=4, warmup=0, minimum_samples=1)
        collector.add(sample(1, 100, domain="linux"))
        report = collector.report()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profile.json"
            write_profile(report, path)
            loaded = load_profile(path)
            self.assertEqual(json.loads(path.read_text()), loaded)
            status = render_status(loaded)
            self.assertIn("add [linux/full]", status)
            self.assertIn("estimator=valid", status)

    def test_distribution_matches_independent_reference(self) -> None:
        values = [11, 13, 17, 19, 23, 29]
        summary = summarize_metric(values)
        reference_mean = sum(values) / len(values)
        reference_stdev = math.sqrt(
            sum((value - reference_mean) ** 2 for value in values) / len(values)
        )
        self.assertEqual(summary.mean, reference_mean)
        self.assertEqual(summary.stdev, reference_stdev)
        self.assertEqual(summary.p50, 18.0)


if __name__ == "__main__":
    unittest.main()
