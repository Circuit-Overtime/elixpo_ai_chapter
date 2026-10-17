from __future__ import annotations

from .model import Measurement
from .statistics import summarize_values

MCU_MICROS_MODULUS = 1 << 32


def analyze_clock_alignment(rows: list[Measurement]) -> dict[str, int | float | None]:
    successful = sorted(
        (
            row
            for row in rows
            if row.outcome == "ok"
            and row.mcu_value is not None
            and row.linux_started_ns is not None
            and row.linux_finished_ns is not None
        ),
        key=lambda row: row.sequence,
    )
    if not successful:
        return {
            "clock_alignment_samples": 0,
            "clock_sample_span_ns": None,
            "clock_mcu_wraps": 0,
            "clock_uncertainty_minimum_ns": None,
            "clock_uncertainty_p50_ns": None,
            "clock_uncertainty_p95_ns": None,
            "clock_uncertainty_p99_ns": None,
            "clock_uncertainty_maximum_ns": None,
            "clock_offset_midpoint_start_ns": None,
            "clock_offset_midpoint_end_ns": None,
            "clock_drift_regression_ppm": None,
            "clock_drift_lower_ppm": None,
            "clock_drift_upper_ppm": None,
            "clock_endpoint_window_samples": 0,
            "clock_drift_endpoint_span_ns": None,
        }

    samples: list[dict[str, int]] = []
    wrap_offset_us = 0
    previous_mcu_us: int | None = None
    wrap_count = 0
    for row in successful:
        assert row.mcu_value is not None
        assert row.linux_started_ns is not None
        assert row.linux_finished_ns is not None
        if row.linux_finished_ns < row.linux_started_ns:
            raise ValueError("clock alignment sample has a negative Linux interval")

        raw_mcu_us = row.mcu_value
        if not 0 <= raw_mcu_us < MCU_MICROS_MODULUS:
            raise ValueError("MCU clock sample is outside the uint32 micros range")
        if previous_mcu_us is not None and raw_mcu_us < previous_mcu_us:
            if previous_mcu_us - raw_mcu_us <= MCU_MICROS_MODULUS // 2:
                raise ValueError("MCU clock moved backwards without a wrap")
            wrap_offset_us += MCU_MICROS_MODULUS
            wrap_count += 1
        previous_mcu_us = raw_mcu_us

        mcu_ns = (wrap_offset_us + raw_mcu_us) * 1000
        midpoint_ns = (row.linux_started_ns + row.linux_finished_ns) // 2
        samples.append(
            {
                "sequence": row.sequence,
                "midpoint_ns": midpoint_ns,
                "offset_midpoint_ns": midpoint_ns - mcu_ns,
                "offset_lower_ns": row.linux_started_ns - mcu_ns,
                "offset_upper_ns": row.linux_finished_ns - mcu_ns,
                "uncertainty_ns": (row.linux_finished_ns - row.linux_started_ns + 1) // 2,
                "latency_ns": row.linux_finished_ns - row.linux_started_ns,
            }
        )

    uncertainty = summarize_values(sample["uncertainty_ns"] for sample in samples)
    first_midpoint_ns = samples[0]["midpoint_ns"]
    first_offset_ns = samples[0]["offset_midpoint_ns"]
    x_values = [sample["midpoint_ns"] - first_midpoint_ns for sample in samples]
    y_values = [sample["offset_midpoint_ns"] - first_offset_ns for sample in samples]
    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(y_values) / len(y_values)
    denominator = sum((value - x_mean) ** 2 for value in x_values)
    drift_regression_ppm = (
        sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values, strict=True))
        / denominator
        * 1_000_000
        if denominator > 0
        else None
    )

    window_samples = max(1, len(samples) // 10)
    best_start = min(samples[:window_samples], key=lambda sample: sample["latency_ns"])
    best_end = min(samples[-window_samples:], key=lambda sample: sample["latency_ns"])
    endpoint_span_ns = best_end["midpoint_ns"] - best_start["midpoint_ns"]
    if endpoint_span_ns > 0:
        drift_lower_ppm = (
            (best_end["offset_lower_ns"] - best_start["offset_upper_ns"])
            / endpoint_span_ns
            * 1_000_000
        )
        drift_upper_ppm = (
            (best_end["offset_upper_ns"] - best_start["offset_lower_ns"])
            / endpoint_span_ns
            * 1_000_000
        )
    else:
        drift_lower_ppm = None
        drift_upper_ppm = None

    return {
        "clock_alignment_samples": len(samples),
        "clock_sample_span_ns": samples[-1]["midpoint_ns"] - samples[0]["midpoint_ns"],
        "clock_mcu_wraps": wrap_count,
        "clock_uncertainty_minimum_ns": uncertainty.minimum,
        "clock_uncertainty_p50_ns": uncertainty.p50,
        "clock_uncertainty_p95_ns": uncertainty.p95,
        "clock_uncertainty_p99_ns": uncertainty.p99,
        "clock_uncertainty_maximum_ns": uncertainty.maximum,
        "clock_offset_midpoint_start_ns": samples[0]["offset_midpoint_ns"],
        "clock_offset_midpoint_end_ns": samples[-1]["offset_midpoint_ns"],
        "clock_drift_regression_ppm": drift_regression_ppm,
        "clock_drift_lower_ppm": drift_lower_ppm,
        "clock_drift_upper_ppm": drift_upper_ppm,
        "clock_endpoint_window_samples": window_samples,
        "clock_drift_endpoint_span_ns": endpoint_span_ns,
    }
