import json
import tempfile
import unittest
from pathlib import Path

from qfabric_stage1.analysis import analyze
from qfabric_stage1.io import append_measurements, load_measurements
from qfabric_stage1.model import Measurement


class MeasurementIoTests(unittest.TestCase):
    def test_round_trip_and_analysis(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_path = root / "raw.jsonl"
            json_path = root / "summary.json"
            csv_path = root / "summary.csv"
            rows = [
                Measurement(
                    run_id="a",
                    experiment="rpc-roundtrip",
                    sequence=index,
                    started_utc="2026-01-01T00:00:00+00:00",
                    latency_ns=latency,
                    outcome="ok",
                    payload_bytes=8,
                )
                for index, latency in enumerate((100, 200, 300))
            ]

            append_measurements(raw_path, rows)
            self.assertEqual(list(load_measurements(raw_path)), rows)

            result = analyze(raw_path, json_path, csv_path)
            self.assertEqual(result["groups"][0]["count"], 3)
            self.assertTrue(csv_path.read_text(encoding="utf-8").startswith("experiment,"))
            self.assertEqual(json.loads(json_path.read_text())["schema_version"], 1)

    def test_analysis_separates_runs_and_summarizes_matrix_execution(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_path = root / "matrix.jsonl"
            rows = [
                Measurement(
                    run_id=run_id,
                    experiment="matrix-update",
                    sequence=index,
                    started_utc="2026-01-01T00:00:00+00:00",
                    latency_ns=latency,
                    outcome="ok",
                    mcu_value=execution,
                )
                for run_id, index, latency, execution in (
                    ("run-a", 0, 100, 5),
                    ("run-a", 1, 200, 7),
                    ("run-b", 0, 300, 11),
                )
            ]
            append_measurements(raw_path, rows)

            result = analyze(raw_path, root / "summary.json", root / "summary.csv")

            self.assertEqual(len(result["groups"]), 2)
            first = result["groups"][0]
            self.assertEqual(first["run_id"], "run-a")
            self.assertEqual(first["count"], 2)
            self.assertEqual(first["mcu_execution_us"]["p50"], 6)
            csv_text = (root / "summary.csv").read_text(encoding="utf-8")
            self.assertIn("mcu_execution_p50_us", csv_text)
            self.assertIn("run-a", csv_text)

    def test_analysis_summarizes_mcu_to_linux_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_path = root / "reverse.jsonl"
            rows = [
                Measurement(
                    run_id="reverse-run",
                    experiment="mcu-linux-roundtrip",
                    sequence=index,
                    started_utc="2026-01-01T00:00:00+00:00",
                    latency_ns=latency,
                    outcome="ok",
                    mcu_value=duration,
                )
                for index, latency, duration in (
                    (0, 100_000, 20),
                    (1, 120_000, 40),
                    (2, 140_000, 60),
                )
            ]
            append_measurements(raw_path, rows)

            result = analyze(raw_path, root / "summary.json", root / "summary.csv")

            group = result["groups"][0]
            self.assertEqual(group["mcu_roundtrip_us"]["p50"], 40)
            self.assertIn(
                "mcu_roundtrip_p50_us",
                (root / "summary.csv").read_text(encoding="utf-8"),
            )

    def test_analysis_reports_concurrent_wall_clock_rate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_path = root / "concurrency.jsonl"
            rows = [
                Measurement(
                    run_id="concurrent-run",
                    experiment="rpc-concurrency-4",
                    sequence=index,
                    started_utc="2026-01-01T00:00:00+00:00",
                    latency_ns=latency,
                    outcome=outcome,
                    payload_bytes=8,
                    concurrency=4,
                    batch_elapsed_ns=1_000_000_000,
                )
                for index, latency, outcome in (
                    (0, 100, "ok"),
                    (1, 200, "ok"),
                    (2, 300, "ok"),
                    (3, 400, "error"),
                )
            ]
            append_measurements(raw_path, rows)

            result = analyze(raw_path, root / "summary.json", root / "summary.csv")

            group = result["groups"][0]
            self.assertEqual(group["concurrency"], 4)
            self.assertEqual(group["concurrent_batch_elapsed_ns"], 1_000_000_000)
            self.assertEqual(group["concurrent_attempts_per_second"], 4)
            self.assertEqual(group["concurrent_successes_per_second"], 3)
            csv_text = (root / "summary.csv").read_text(encoding="utf-8")
            self.assertIn("concurrent_successes_per_second", csv_text)

    def test_analysis_reports_clock_alignment_bounds(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_path = root / "clock.jsonl"
            rows = [
                Measurement(
                    run_id="clock-run",
                    experiment="clock-alignment",
                    sequence=index,
                    started_utc="2026-01-01T00:00:00+00:00",
                    latency_ns=1000,
                    outcome="ok",
                    mcu_value=1_000_000 + index * 100_000,
                    linux_started_ns=6_000_000_000 + index * 100_010_000 - 500,
                    linux_finished_ns=6_000_000_000 + index * 100_010_000 + 500,
                )
                for index in range(3)
            ]
            append_measurements(raw_path, rows)

            result = analyze(raw_path, root / "summary.json", root / "summary.csv")

            group = result["groups"][0]
            self.assertEqual(group["clock_alignment_samples"], 3)
            self.assertEqual(group["clock_uncertainty_minimum_ns"], 500)
            self.assertIsNotNone(group["clock_drift_regression_ppm"])
            self.assertIn(
                "clock_drift_lower_ppm",
                (root / "summary.csv").read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()
