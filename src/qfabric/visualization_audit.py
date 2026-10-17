from __future__ import annotations

import json
import statistics
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _group(profile: dict[str, Any], domain: str) -> dict[str, Any]:
    matches = [
        group
        for group in profile["groups"]
        if group["task"] == "add"
        and group["domain"] == domain
        and group["instrumentation"] == "full"
    ]
    if len(matches) != 1:
        raise ValueError(f"expected one add/{domain}/full profile group")
    return matches[0]


def audit_stage9(
    campaign_path: Path,
    disabled_profiles: list[Path],
    enabled_profiles: list[Path],
    *,
    maximum_p95_regression_pct: float = 15.0,
) -> dict[str, object]:
    if len(disabled_profiles) != len(enabled_profiles) or not disabled_profiles:
        raise ValueError("enabled and disabled profile sets must be non-empty and paired")
    campaign = _load(campaign_path)
    failures: list[str] = []
    if campaign.get("status") != "pass":
        failures.append("hardware visualization campaign did not pass")

    cases = campaign.get("cases", [])
    modes = {case["mode"] for case in cases}
    states = {case["telemetry"]["contract_state"] for case in cases}
    events = {case["telemetry"]["event"] for case in cases}
    required_modes = {"placement", "contracts", "jitter", "ipc"}
    required_states = {"UNKNOWN", "SATISFIED", "AT_RISK", "VIOLATED"}
    required_events = {"stable", "transition", "rollback", "infeasible"}
    if not required_modes <= modes:
        failures.append("visualization campaign lacks required mode coverage")
    if not required_states <= states:
        failures.append("visualization campaign lacks required contract-state coverage")
    if not required_events <= events:
        failures.append("visualization campaign lacks required event coverage")

    refresh_hz = campaign["configuration"]["refresh_hz"]
    refresh_bounded = 5 <= refresh_hz <= 10
    if not refresh_bounded:
        failures.append("matrix refresh rate is outside 5-10 Hz")
    off = campaign["off"]["diagnostics"]
    off_verified = (
        off["mode_id"] == 0
        and off["target_refresh_hz"] == 0
        and off["frame_checksum"] == 0
        and campaign["off"]["linux_user_rgb"] == 0
    )
    if not off_verified:
        failures.append("off mode is not blank and disabled")
    system_leds_preserved = (
        campaign.get("linux_system_leds", {}).get("triggers_preserved") is True
    )
    if not system_leds_preserved:
        failures.append("Linux system LED state was not proven preserved")

    comparisons: list[dict[str, object]] = []
    protected_contracts_healthy = True
    overhead_within_budget = True
    for domain in ("linux", "rt"):
        disabled_groups = [_group(_load(path), domain) for path in disabled_profiles]
        enabled_groups = [_group(_load(path), domain) for path in enabled_profiles]
        disabled_p95 = [group["metrics_ns"]["end_to_end"]["p95"] for group in disabled_groups]
        enabled_p95 = [group["metrics_ns"]["end_to_end"]["p95"] for group in enabled_groups]
        disabled_mean = [group["metrics_ns"]["end_to_end"]["mean"] for group in disabled_groups]
        enabled_mean = [group["metrics_ns"]["end_to_end"]["mean"] for group in enabled_groups]
        baseline_p95 = statistics.median(disabled_p95)
        active_p95 = statistics.median(enabled_p95)
        baseline_mean = statistics.median(disabled_mean)
        active_mean = statistics.median(enabled_mean)
        p95_delta_pct = (active_p95 - baseline_p95) / baseline_p95 * 100.0
        mean_delta_pct = (active_mean - baseline_mean) / baseline_mean * 100.0
        groups = disabled_groups + enabled_groups
        healthy = all(
            group["failures"] == 0
            and group["deadline"]["misses"] == 0
            and group["window"]["estimator_valid"]
            for group in groups
        )
        within_budget = p95_delta_pct <= maximum_p95_regression_pct
        protected_contracts_healthy &= healthy
        overhead_within_budget &= within_budget
        comparisons.append(
            {
                "domain": domain,
                "repetitions": len(disabled_groups),
                "disabled_median_mean_ns": baseline_mean,
                "enabled_median_mean_ns": active_mean,
                "mean_delta_pct": mean_delta_pct,
                "disabled_median_p95_ns": baseline_p95,
                "enabled_median_p95_ns": active_p95,
                "p95_delta_pct": p95_delta_pct,
                "p95_regression_budget_pct": maximum_p95_regression_pct,
                "within_budget": within_budget,
                "protected_contract_healthy": healthy,
            }
        )
    if not protected_contracts_healthy:
        failures.append("a protected add contract regressed or its profile was invalid")
    if not overhead_within_budget:
        failures.append("visualization p95 overhead exceeded its regression budget")

    maximum_draw_us = max(
        (case["diagnostics"]["maximum_draw_us"] for case in cases),
        default=0,
    )
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 9,
        "status": "pass" if not failures else "fail",
        "sources": {
            "campaign": str(campaign_path),
            "disabled_profiles": [str(path) for path in disabled_profiles],
            "enabled_profiles": [str(path) for path in enabled_profiles],
        },
        "coverage": {
            "modes": sorted(modes),
            "contract_states": sorted(states),
            "events": sorted(events),
        },
        "maximum_draw_us": maximum_draw_us,
        "comparisons": comparisons,
        "checks": {
            "hardware_campaign_passed": campaign.get("status") == "pass",
            "mode_coverage_complete": required_modes <= modes,
            "contract_state_coverage_complete": required_states <= states,
            "event_coverage_complete": required_events <= events,
            "refresh_rate_bounded": refresh_bounded,
            "off_mode_verified": off_verified,
            "linux_system_leds_preserved": system_leds_preserved,
            "protected_contracts_healthy": protected_contracts_healthy,
            "overhead_within_budget": overhead_within_budget,
        },
        "failures": failures,
    }


def write_stage9_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
