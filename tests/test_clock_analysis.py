import unittest

from qfabric_stage1.clock_analysis import MCU_MICROS_MODULUS, analyze_clock_alignment
from qfabric_stage1.model import Measurement


def clock_row(
    sequence: int,
    mcu_us: int,
    midpoint_ns: int,
    latency_ns: int = 1000,
) -> Measurement:
    return Measurement(
        run_id="clock-run",
        experiment="clock-alignment",
        sequence=sequence,
        started_utc="2026-01-01T00:00:00+00:00",
        latency_ns=latency_ns,
        outcome="ok",
        mcu_value=mcu_us,
        linux_started_ns=midpoint_ns - latency_ns // 2,
        linux_finished_ns=midpoint_ns + latency_ns // 2,
    )


class ClockAnalysisTests(unittest.TestCase):
    def test_estimates_drift_and_endpoint_bounds(self) -> None:
        base_offset_ns = 5_000_000_000
        rows = []
        for sequence in range(3):
            mcu_ns = (1_000_000 + sequence * 100_000) * 1000
            drift_ns = sequence * 10_000
            rows.append(
                clock_row(sequence, mcu_ns // 1000, mcu_ns + base_offset_ns + drift_ns)
            )

        result = analyze_clock_alignment(rows)

        self.assertEqual(result["clock_alignment_samples"], 3)
        self.assertEqual(result["clock_mcu_wraps"], 0)
        self.assertAlmostEqual(result["clock_drift_regression_ppm"], 99.99, places=2)
        self.assertAlmostEqual(result["clock_drift_lower_ppm"], 94.99, places=2)
        self.assertAlmostEqual(result["clock_drift_upper_ppm"], 104.99, places=2)
        self.assertEqual(result["clock_uncertainty_minimum_ns"], 500)

    def test_unwraps_mcu_micros(self) -> None:
        before_wrap_us = MCU_MICROS_MODULUS - 50
        after_wrap_us = 50
        base_offset_ns = 10_000_000_000
        rows = [
            clock_row(0, before_wrap_us, before_wrap_us * 1000 + base_offset_ns),
            clock_row(
                1,
                after_wrap_us,
                (MCU_MICROS_MODULUS + after_wrap_us) * 1000 + base_offset_ns,
            ),
        ]

        result = analyze_clock_alignment(rows)

        self.assertEqual(result["clock_mcu_wraps"], 1)
        self.assertAlmostEqual(result["clock_drift_regression_ppm"], 0, places=6)


if __name__ == "__main__":
    unittest.main()
