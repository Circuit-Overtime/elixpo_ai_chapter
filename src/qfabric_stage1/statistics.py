from __future__ import annotations

import math
from collections.abc import Iterable

from .model import DistributionSummary, Measurement, Summary


def percentile(values: Iterable[int], percentage: float) -> float:
    """Return a linearly interpolated percentile for 0 <= percentage <= 100."""
    if not 0 <= percentage <= 100:
        raise ValueError("percentage must be between 0 and 100")

    ordered = sorted(values)
    if not ordered:
        raise ValueError("at least one value is required")
    if len(ordered) == 1:
        return float(ordered[0])

    position = (len(ordered) - 1) * percentage / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])

    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def summarize_values(values: Iterable[int]) -> DistributionSummary:
    collected = list(values)
    if not collected:
        return DistributionSummary(
            count=0,
            minimum=None,
            p50=None,
            p95=None,
            p99=None,
            maximum=None,
            mean=None,
            stdev=None,
        )

    mean = sum(collected) / len(collected)
    variance = sum((value - mean) ** 2 for value in collected) / len(collected)
    return DistributionSummary(
        count=len(collected),
        minimum=min(collected),
        p50=percentile(collected, 50),
        p95=percentile(collected, 95),
        p99=percentile(collected, 99),
        maximum=max(collected),
        mean=mean,
        stdev=math.sqrt(variance),
    )


def summarize(measurements: Iterable[Measurement]) -> Summary:
    rows = list(measurements)
    successful = [row.latency_ns for row in rows if row.outcome == "ok"]
    failures = len(rows) - len(successful)

    if not successful:
        return Summary(
            total=len(rows),
            count=0,
            failures=failures,
            failure_rate_pct=(100 * failures / len(rows) if rows else 0),
            minimum_ns=None,
            p50_ns=None,
            p95_ns=None,
            p99_ns=None,
            maximum_ns=None,
            mean_ns=None,
            stdev_ns=None,
            sequential_calls_per_second=None,
        )

    latency = summarize_values(successful)
    assert latency.minimum is not None
    assert latency.maximum is not None
    assert latency.mean is not None
    assert latency.stdev is not None
    return Summary(
        total=len(rows),
        count=latency.count,
        failures=failures,
        failure_rate_pct=100 * failures / len(rows),
        minimum_ns=latency.minimum,
        p50_ns=latency.p50,
        p95_ns=latency.p95,
        p99_ns=latency.p99,
        maximum_ns=latency.maximum,
        mean_ns=latency.mean,
        stdev_ns=latency.stdev,
        sequential_calls_per_second=(1_000_000_000 / latency.mean if latency.mean > 0 else None),
    )
