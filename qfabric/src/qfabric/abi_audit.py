from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from .abi import Effect, Schema, canary_eligible, transition_pinned
from .abi_codegen import generate_cpp_header
from .abi_probe import probe_mcu_abi
from .abi_tools import build_golden_vectors, run_compile_fail_cases
from .build import _is_aarch64_elf


def audit_stage3(root: Path, address: str, *, timeout: float) -> dict[str, object]:
    failures: list[str] = []
    schema_path = root / "config/qfabric-abi.json"
    vectors_path = root / "abi/golden-vectors.json"
    generated_path = root / "generated/qfabric_abi.hpp"
    artifact = root / "build/stage3/linux/qf-abi-golden"

    schema: Schema | None = None
    try:
        schema = Schema.load(schema_path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"ABI schema is invalid: {error}")

    generated_current = False
    try:
        generated_current = generated_path.read_text(encoding="utf-8") == generate_cpp_header(
            schema_path
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"generated C++ codec cannot be checked: {error}")
    if not generated_current:
        failures.append("generated C++ codec is stale")

    vectors_current = False
    vectors_document: dict[str, object] = {}
    try:
        vectors_document = json.loads(vectors_path.read_text(encoding="utf-8"))
        vectors_current = vectors_document == build_golden_vectors(schema_path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"golden vectors cannot be checked: {error}")
    if not vectors_current:
        failures.append("golden vectors are stale")

    compile_fail = run_compile_fail_cases(root / "tests/abi_compile_fail")
    if compile_fail["status"] != "pass":
        failures.extend(compile_fail["failures"])

    artifact_is_aarch64 = _is_aarch64_elf(artifact)
    linux_runner: dict[str, object] = {
        "artifact": "build/stage3/linux/qf-abi-golden",
        "is_aarch64": artifact_is_aarch64,
        "exit_code": None,
        "stdout": "",
        "stderr": "",
        "passed": False,
    }
    if not artifact_is_aarch64:
        failures.append("Stage 3 Linux runner is missing or is not an AArch64 ELF")
    else:
        try:
            completed = subprocess.run(
                [str(artifact)],
                cwd=root,
                text=True,
                capture_output=True,
                check=False,
                timeout=10,
            )
            linux_runner.update(
                {
                    "exit_code": completed.returncode,
                    "stdout": completed.stdout.strip(),
                    "stderr": completed.stderr.strip(),
                    "passed": completed.returncode == 0,
                }
            )
            if completed.returncode != 0:
                failures.append(f"Stage 3 ARM64 golden runner exited {completed.returncode}")
        except (OSError, subprocess.TimeoutExpired) as error:
            failures.append(f"Stage 3 ARM64 golden runner failed: {error}")

    mcu_probe: dict[str, object] = {"status": "fail", "failures": ["probe not run"]}
    try:
        mcu_probe = probe_mcu_abi(vectors_path, address, timeout=timeout)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"Stage 3 MCU ABI probe failed: {error}")
    else:
        if mcu_probe["status"] != "pass":
            failures.extend(mcu_probe["failures"])
        if mcu_probe.get("schema_sha256") != vectors_document.get("schema_sha256"):
            failures.append("MCU probe and golden vectors use different schemas")
        if mcu_probe.get("scalar_boundaries") is not True:
            failures.append("MCU scalar boundary check did not pass")

    effects: list[dict[str, object]] = []
    if schema is not None:
        for task in schema.tasks.values():
            eligible = canary_eligible(task.effect)
            pinned = transition_pinned(task.effect, task.transition_hooks)
            if eligible != (task.effect is Effect.PURE):
                failures.append(f"task {task.name} violates pure-only canary eligibility")
            if task.effect in {Effect.STATEFUL, Effect.ACTUATING}:
                if not task.transition_hooks and not pinned:
                    failures.append(f"task {task.name} must remain pinned")
            effects.append(
                {
                    "task": task.name,
                    "effect": task.effect.name.lower(),
                    "canary_eligible": eligible,
                    "transition_hooks": task.transition_hooks,
                    "pinned": pinned,
                }
            )

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 3,
        "status": "pass" if not failures else "fail",
        "protocol_version": vectors_document.get("protocol_version"),
        "abi_schema_sha256": vectors_document.get("schema_sha256"),
        "generated_codec_current": generated_current,
        "golden_vectors_current": vectors_current,
        "compile_fail": compile_fail,
        "linux_runner": linux_runner,
        "mcu_probe": mcu_probe,
        "effects": effects,
        "failures": failures,
    }


def write_stage3_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
