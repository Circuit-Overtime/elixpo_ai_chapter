from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .runtime import _connect_bridge

DECODE_SCENARIOS = {
    "valid": (0, 0),
    "version-mismatch": (1, 3),
    "malformed-boolean": (2, 1),
    "short-header": (3, 1),
    "oversized-message": (4, 2),
    "reserved-flags": (5, 1),
}

REPLAY_SCENARIOS = (
    ("first-accept", 7, 100, 0),
    ("duplicate", 7, 100, 6),
    ("stale-epoch", 6, 101, 5),
    ("new-epoch", 8, 100, 0),
)


def probe_mcu_abi(
    vectors_path: Path,
    address: str,
    *,
    timeout: float,
) -> dict[str, object]:
    vectors_document = json.loads(vectors_path.read_text(encoding="utf-8"))
    vectors = vectors_document["vectors"]
    failures: list[str] = []
    vector_results: list[dict[str, object]] = []
    scenario_results: list[dict[str, object]] = []
    replay_results: list[dict[str, object]] = []
    scalar_boundaries = False

    bridge: Any = _connect_bridge(address)
    try:
        for index, vector in enumerate(vectors):
            observed = bridge.call("qf_stage3_golden_vector", index, timeout=timeout)
            expected = vector["frame_hex"]
            matches = observed == expected
            vector_results.append(
                {
                    "name": vector["name"],
                    "expected_hex": expected,
                    "observed_hex": observed,
                    "matches": matches,
                }
            )
            if not matches:
                failures.append(f"MCU golden vector mismatch: {vector['name']}")

        for name, (scenario, expected) in DECODE_SCENARIOS.items():
            observed = bridge.call("qf_stage3_decode_status", scenario, timeout=timeout)
            matches = observed == expected
            scenario_results.append(
                {
                    "name": name,
                    "expected_status": expected,
                    "observed_status": observed,
                    "matches": matches,
                }
            )
            if not matches:
                failures.append(
                    f"MCU decode status mismatch for {name}: expected {expected}, got {observed}"
                )

        if bridge.call("qf_stage3_replay_reset", timeout=timeout) is not True:
            failures.append("MCU replay guard reset failed")
        for name, epoch, invocation_id, expected in REPLAY_SCENARIOS:
            observed = bridge.call(
                "qf_stage3_replay_status", epoch, invocation_id, timeout=timeout
            )
            matches = observed == expected
            replay_results.append(
                {
                    "name": name,
                    "epoch": epoch,
                    "invocation_id": invocation_id,
                    "expected_status": expected,
                    "observed_status": observed,
                    "matches": matches,
                }
            )
            if not matches:
                failures.append(
                    f"MCU replay status mismatch for {name}: expected {expected}, got {observed}"
                )
        scalar_boundaries = bridge.call("qf_stage3_scalar_boundaries", timeout=timeout) is True
        if not scalar_boundaries:
            failures.append("MCU scalar boundary round trip failed")
    finally:
        bridge.disconnect()

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "protocol_version": vectors_document["protocol_version"],
        "schema_sha256": vectors_document["schema_sha256"],
        "status": "pass" if not failures else "fail",
        "vectors": vector_results,
        "decode_scenarios": scenario_results,
        "replay_scenarios": replay_results,
        "scalar_boundaries": scalar_boundaries,
        "failures": failures,
    }


def write_probe_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
