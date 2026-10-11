from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .visualization_runtime import MODE_IDS, linux_system_led_snapshot, set_view

CASES = (
    ("placement-stable", "placement", 1, "SATISFIED", "stable"),
    ("placement-transition", "placement", 2, "SATISFIED", "transition"),
    ("contracts-unknown", "contracts", 3, "UNKNOWN", "stable"),
    ("contracts-at-risk", "contracts", 6, "AT_RISK", "stable"),
    ("contracts-violated", "contracts", 12, "VIOLATED", "stable"),
    ("contracts-recovered", "contracts", 14, "SATISFIED", "stable"),
    ("jitter-measured", "jitter", 11, "VIOLATED", "rollback"),
    ("ipc-active", "ipc", 6, "AT_RISK", "stable"),
    ("placement-rollback", "placement", 11, "VIOLATED", "rollback"),
    ("placement-infeasible", "placement", 15, "VIOLATED", "infeasible"),
)


def _system_triggers(snapshot: dict[str, dict[str, str]]) -> dict[str, str]:
    return {name: values["trigger"] for name, values in snapshot.items()}


def _validate_case(
    report: dict[str, Any],
    *,
    mode: str,
    decision_id: int,
    state: str,
    event: str,
    refresh_hz: int,
) -> list[str]:
    diagnostics = report["diagnostics"]
    telemetry = report["telemetry"]
    failures: list[str] = []
    expected = {
        "mode": mode,
        "decision_id": decision_id,
        "state": state,
        "event": event,
        "mode_id": int(MODE_IDS[mode]),
        "refresh_hz": refresh_hz,
        "frame_checksum": report["frame_checksum"],
    }
    observed = {
        "mode": report["mode"],
        "decision_id": diagnostics["last_decision_id"],
        "state": telemetry["contract_state"],
        "event": telemetry["event"],
        "mode_id": diagnostics["mode_id"],
        "refresh_hz": diagnostics["target_refresh_hz"],
        "frame_checksum": diagnostics["frame_checksum"],
    }
    for key, value in expected.items():
        if observed[key] != value:
            failures.append(f"{key}: expected {value!r}, observed {observed[key]!r}")
    if diagnostics["applied_frames"] < 1:
        failures.append("MCU did not apply a frame")
    if diagnostics["last_draw_us"] < 0:
        failures.append("MCU reported an invalid draw duration")
    health = {
        "UNKNOWN": 0x0000FF,
        "SATISFIED": 0x00FF00,
        "AT_RISK": 0xFFFF00,
        "VIOLATED": 0xFF0000,
    }[state]
    expected_linux_rgb = health if telemetry["domain"] == "linux" else 0
    expected_mcu_rgb = health if telemetry["domain"] == "rt" else 0
    if report["linux_user_rgb"] != expected_linux_rgb:
        failures.append("Linux user RGB does not match Linux-domain health")
    if diagnostics["health_rgb"] != expected_mcu_rgb:
        failures.append("MCU health RGB does not match RT-domain health")
    return failures


def run_visualization_campaign(
    history: Path,
    address: str,
    *,
    refresh_hz: int = 8,
    overlay_ms: int = 100,
    timeout: float = 2.0,
) -> dict[str, object]:
    cases: list[dict[str, object]] = []
    failures: list[str] = []
    off: dict[str, object] | None = None
    system_leds_before = linux_system_led_snapshot()
    try:
        for name, mode, decision_id, state, event in CASES:
            report = set_view(
                mode,
                history=history,
                task="add",
                decision_id=decision_id,
                address=address,
                refresh_hz=refresh_hz,
                overlay_ms=overlay_ms,
                timeout=timeout,
            )
            case_failures = _validate_case(
                report,
                mode=mode,
                decision_id=decision_id,
                state=state,
                event=event,
                refresh_hz=refresh_hz,
            )
            failures.extend(f"{name}: {failure}" for failure in case_failures)
            cases.append(
                {
                    "name": name,
                    "status": "pass" if not case_failures else "fail",
                    **report,
                }
            )
    finally:
        off = set_view(
            "off",
            history=history,
            task="add",
            decision_id=None,
            address=address,
            refresh_hz=refresh_hz,
            overlay_ms=0,
            timeout=timeout,
        )
    off_diagnostics = off["diagnostics"]
    system_leds_after = linux_system_led_snapshot()
    if (
        off_diagnostics["mode_id"] != 0
        or off_diagnostics["target_refresh_hz"] != 0
        or off_diagnostics["frame_checksum"] != 0
    ):
        failures.append("off: MCU did not enter a blank disabled state")
    if off["linux_user_rgb"] != 0:
        failures.append("off: Linux user RGB did not turn off")
    system_triggers_preserved = _system_triggers(system_leds_before) == _system_triggers(
        system_leds_after
    )
    if not system_triggers_preserved:
        failures.append("Linux system LED triggers changed during visualization")
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 9,
        "status": "pass" if not failures else "fail",
        "configuration": {
            "history": str(history),
            "refresh_hz": refresh_hz,
            "overlay_ms": overlay_ms,
        },
        "cases": cases,
        "off": off,
        "linux_system_leds": {
            "before": system_leds_before,
            "after": system_leds_after,
            "triggers_preserved": system_triggers_preserved,
        },
        "failures": failures,
    }


def write_visualization_campaign(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
