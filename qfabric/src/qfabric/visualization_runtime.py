from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .decision_history import DecisionStore
from .runtime import _connect_bridge
from .visualization import (
    TaskTelemetry,
    ViewMode,
    VisualEvent,
    frame_checksum,
    render_frame,
    telemetry_from_decision,
)

MODE_IDS = {
    ViewMode.OFF: 0,
    ViewMode.PLACEMENT: 1,
    ViewMode.CONTRACTS: 2,
    ViewMode.JITTER: 3,
    ViewMode.IPC: 4,
}

LINUX_USER_LEDS = {
    "red": "red:user",
    "green": "green:user",
    "blue": "blue:user",
}
LINUX_SYSTEM_LEDS = ("red:panic", "green:wlan", "blue:bt")


def _write_linux_user_rgb(packed: int, root: Path = Path("/sys/class/leds")) -> int:
    masks = {"red": 0xFF0000, "green": 0x00FF00, "blue": 0x0000FF}
    observed = 0
    for channel, name in LINUX_USER_LEDS.items():
        brightness = root / name / "brightness"
        value = 1 if packed & masks[channel] else 0
        brightness.write_text(f"{value}\n", encoding="ascii")
        if int(brightness.read_text(encoding="ascii").strip()):
            observed |= masks[channel]
    return observed


def linux_system_led_snapshot(root: Path = Path("/sys/class/leds")) -> dict[str, dict[str, str]]:
    return {
        name: {
            field: (root / name / field).read_text(encoding="ascii").strip()
            for field in ("brightness", "trigger")
        }
        for name in LINUX_SYSTEM_LEDS
    }


def _rgb(item: TaskTelemetry) -> tuple[int, int]:
    health = {
        "UNKNOWN": 0x0000FF,
        "SATISFIED": 0x00FF00,
        "AT_RISK": 0xFFFF00,
        "VIOLATED": 0xFF0000,
        "INFEASIBLE": 0xFF0000,
    }[item.contract_state]
    activity = {
        VisualEvent.STABLE: 0x0000FF if item.ipc_active else 0x000000,
        VisualEvent.VIOLATION: 0xFF0000,
        VisualEvent.TRANSITION: 0xFFFFFF,
        VisualEvent.COMMIT: 0x00FF00,
        VisualEvent.ROLLBACK: 0xFF00FF,
        VisualEvent.INFEASIBLE: 0xFF0000,
    }[item.event]
    return health, activity


def _encode(frame: tuple[int, ...]) -> str:
    return "".join(str(value) for value in frame)


def _diagnostics(bridge: Any, timeout: float) -> dict[str, int]:
    names = (
        "mode_id",
        "target_refresh_hz",
        "submitted_frames",
        "applied_frames",
        "coalesced_frames",
        "changed_pixels",
        "last_decision_id",
        "maximum_draw_us",
        "last_draw_us",
        "frame_checksum",
        "health_rgb",
        "activity_rgb",
    )
    return {
        name: int(bridge.call("qf_stage9_diagnostic", index, timeout=timeout))
        for index, name in enumerate(names)
    }


def set_view(
    mode: ViewMode | str,
    *,
    history: Path,
    task: str,
    decision_id: int | None,
    address: str,
    refresh_hz: int = 8,
    overlay_ms: int = 500,
    timeout: float = 2.0,
) -> dict[str, object]:
    selected_mode = ViewMode(mode)
    if not 5 <= refresh_hz <= 10:
        raise ValueError("view refresh_hz must be between 5 and 10")
    if overlay_ms < 0:
        raise ValueError("view overlay_ms must not be negative")
    bridge = _connect_bridge(address)
    try:
        configured = bridge.call(
            "qf_stage9_configure",
            MODE_IDS[selected_mode],
            0 if selected_mode == ViewMode.OFF else refresh_hz,
            timeout=timeout,
        )
        if configured is not True:
            raise RuntimeError("MCU rejected the visualization configuration")
        if selected_mode == ViewMode.OFF:
            linux_user_rgb = _write_linux_user_rgb(0)
            time.sleep(0.15)
            return {
                "schema_version": 1,
                "mode": selected_mode.value,
                "decision_id": None,
                "telemetry": None,
                "frame_checksum": 0,
                "linux_user_rgb": linux_user_rgb,
                "diagnostics": _diagnostics(bridge, timeout),
            }

        store = DecisionStore(history)
        record = store.latest(task) if decision_id is None else store.get(decision_id)
        if record["task"] != task:
            raise ValueError(f"decision {record['decision_id']} belongs to task {record['task']}")
        item = telemetry_from_decision(record, slot=0)
        base = render_frame(selected_mode, [item])
        overlay = render_frame(selected_mode, [item], overlay=item)
        health_rgb, activity_rgb = _rgb(item)
        linux_health_rgb = health_rgb if item.domain == "linux" else 0
        mcu_health_rgb = health_rgb if item.domain == "rt" else 0

        submitted = bridge.call(
            "qf_stage9_submit",
            item.decision_id,
            mcu_health_rgb,
            activity_rgb,
            _encode(overlay),
            timeout=timeout,
        )
        if submitted is not True:
            raise RuntimeError("MCU rejected the visualization frame")
        linux_user_rgb = _write_linux_user_rgb(linux_health_rgb)
        if item.event != VisualEvent.STABLE and overlay_ms:
            time.sleep(overlay_ms / 1000)
            submitted = bridge.call(
                "qf_stage9_submit",
                item.decision_id,
                mcu_health_rgb,
                0x0000FF if item.ipc_active else 0,
                _encode(base),
                timeout=timeout,
            )
            if submitted is not True:
                raise RuntimeError("MCU rejected the restored base frame")
        time.sleep(max(0.15, 1.5 / refresh_hz))
        return {
            "schema_version": 1,
            "mode": selected_mode.value,
            "decision_id": item.decision_id,
            "telemetry": item.to_dict(),
            "frame_checksum": frame_checksum(base),
            "overlay_checksum": frame_checksum(overlay),
            "linux_user_rgb": linux_user_rgb,
            "diagnostics": _diagnostics(bridge, timeout),
        }
    finally:
        bridge.disconnect()
