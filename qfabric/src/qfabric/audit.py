from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

from .build import _is_aarch64_elf
from .runtime import run_linux, run_rt

EXPECTED_VALIDATION_ERROR = "error: add requires exactly two signed 32-bit integer arguments"


def _validation_result(root: Path, domain: str) -> dict[str, object]:
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "qfabric.cli",
            "run",
            "add",
            "--domain",
            domain,
            "--",
            "2",
        ],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    return {
        "exit_code": completed.returncode,
        "stderr": completed.stderr.strip(),
    }


def audit_stage2(root: Path, address: str, *, timeout: float) -> dict[str, object]:
    source = root / "qtasks/add.qtask.h"
    build_report_path = root / "build/stage2/build-report.json"
    linux_artifact = root / "build/stage2/linux/qf-add-linux"

    failures: list[str] = []
    build_report: dict[str, object] = {}
    try:
        build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        failures.append(f"build report is unavailable or invalid: {error}")

    build_targets = build_report.get("targets", {})
    linux_target = build_targets.get("linux", {}) if isinstance(build_targets, dict) else {}
    rt_target = build_targets.get("rt", {}) if isinstance(build_targets, dict) else {}
    build_valid = (
        build_report.get("status") == "pass"
        and build_report.get("stage") == 2
        and build_report.get("task") == "add"
        and isinstance(linux_target, dict)
        and linux_target.get("passed") is True
        and linux_target.get("architecture") == "aarch64"
        and isinstance(rt_target, dict)
        and rt_target.get("passed") is True
        and rt_target.get("architecture") == "cortex-m33-zephyr"
    )
    if not build_valid:
        failures.append("dual-target build report does not record a Stage 2 pass")

    source_sha256: str | None = None
    if source.is_file():
        source_sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
    else:
        failures.append(f"QTask source declaration is missing: {source}")

    artifact_valid = _is_aarch64_elf(linux_artifact)
    if not artifact_valid:
        failures.append("Linux runtime artifact is not a 64-bit little-endian AArch64 ELF")

    linux_result: int | None = None
    rt_result: int | None = None
    try:
        linux_result = run_linux(root, 2, 3)
    except (OSError, RuntimeError, ValueError) as error:
        failures.append(f"Linux execution failed: {error}")
    try:
        rt_result = run_rt(address, 2, 3, timeout=timeout)
    except (OSError, RuntimeError, ValueError) as error:
        failures.append(f"RT execution failed: {error}")

    validation = {
        domain: _validation_result(root, domain) for domain in ("linux", "rt")
    }
    validation_matches = (
        validation["linux"] == validation["rt"]
        and validation["linux"]["exit_code"] != 0
        and validation["linux"]["stderr"] == EXPECTED_VALIDATION_ERROR
    )
    if not validation_matches:
        failures.append("Linux and RT CLI validation behavior differs")

    results_match = linux_result == rt_result == 5
    if not results_match:
        failures.append(
            f"dual-domain result mismatch: expected 5, linux={linux_result}, rt={rt_result}"
        )

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 2,
        "status": "pass" if not failures else "fail",
        "task": "add",
        "source_declaration": {
            "path": "qtasks/add.qtask.h",
            "sha256": source_sha256,
        },
        "build": {
            "report": "build/stage2/build-report.json",
            "valid": build_valid,
            "linux_artifact_is_aarch64": artifact_valid,
        },
        "runtime": {
            "host_architecture": platform.machine().lower(),
            "arguments": [2, 3],
            "expected": 5,
            "linux_result": linux_result,
            "rt_result": rt_result,
            "results_match": results_match,
        },
        "validation": {
            "linux": validation["linux"],
            "rt": validation["rt"],
            "matches": validation_matches,
        },
        "failures": failures,
    }


def write_audit(result: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
