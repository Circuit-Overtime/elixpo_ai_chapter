import unittest

from qfabric_stage1.model import Measurement
from qfabric_stage1.statistics import percentile, summarize, summarize_values


def measurement(latency_ns: int, outcome: str = "ok") -> Measurement:
    return Measurement(
        run_id="run",
        experiment="test",
        sequence=0,
        started_utc="2026-01-01T00:00:00+00:00",
        latency_ns=latency_ns,
        outcome=outcome,
    )


class PercentileTests(unittest.TestCase):
    def test_linear_interpolation(self) -> None:
        self.assertEqual(percentile([0, 10], 50), 5)
        self.assertEqual(percentile([0, 10, 20], 95), 19)

    def test_rejects_empty_input(self) -> None:
        with self.assertRaises(ValueError):
            percentile([], 50)


class SummaryTests(unittest.TestCase):
    def test_value_summary(self) -> None:
        result = summarize_values([5, 7, 9])
        self.assertEqual(result.count, 3)
        self.assertEqual(result.minimum, 5)
        self.assertEqual(result.p50, 7)
        self.assertEqual(result.maximum, 9)
        self.assertEqual(result.mean, 7)

    def test_empty_value_summary(self) -> None:
        result = summarize_values([])
        self.assertEqual(result.count, 0)
        self.assertIsNone(result.mean)

    def test_summary_excludes_failed_samples(self) -> None:
        result = summarize([measurement(10), measurement(20), measurement(999, "error")])
        self.assertEqual(result.count, 2)
        self.assertEqual(result.total, 3)
        self.assertEqual(result.failures, 1)
        self.assertAlmostEqual(result.failure_rate_pct, 100 / 3)
        self.assertEqual(result.minimum_ns, 10)
        self.assertEqual(result.maximum_ns, 20)
        self.assertEqual(result.mean_ns, 15)
        self.assertAlmostEqual(result.sequential_calls_per_second, 1_000_000_000 / 15)

    def test_all_failures_have_no_latency_statistics(self) -> None:
        result = summarize([measurement(10, "error")])
        self.assertEqual(result.count, 0)
        self.assertEqual(result.failures, 1)
        self.assertIsNone(result.p99_ns)


if __name__ == "__main__":
    unittest.main()
