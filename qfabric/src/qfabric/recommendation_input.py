from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .abi import Schema
from .profiling import load_profile

OPERATIONS_SCHEMA_VERSION = 1


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _profile_group(profile: dict[str, Any], task: str, domain: str) -> dict[str, Any]:
    matches = [
        group
        for group in profile["groups"]
        if group.get("task") == task
        and group.get("domain") == domain
        and group.get("instrumentation") == "full"
    ]
    if len(matches) != 1:
        raise ValueError(f"expected exactly one full profile group for {task}/{domain}")
    return matches[0]


def _validate_operations(operations: dict[str, Any]) -> None:
    if operations.get("schema_version") != OPERATIONS_SCHEMA_VERSION:
        raise ValueError("unsupported recommendation operations schema version")
    if operations.get("current_domain") not in {"linux", "rt"}:
        raise ValueError("operations current_domain must be linux or rt")
    if not isinstance(operations.get("task"), str):
        raise ValueError("operations must name a task")
    if not isinstance(operations.get("admission"), dict) or set(
        operations["admission"]
    ) != {"linux", "rt"}:
        raise ValueError("operations admission must declare linux and rt")
    if not all(isinstance(value, bool) for value in operations["admission"].values()):
        raise ValueError("operations admission values must be boolean")
    if not isinstance(operations.get("mcu"), dict):
        raise ValueError("operations must declare MCU capacity")
    if not isinstance(operations.get("chain_edges", []), list):
        raise ValueError("operations chain_edges must be a list")


def build_recommendation_input(
    stage5_root: Path,
    abi_path: Path,
    operations: dict[str, Any],
) -> dict[str, Any]:
    _validate_operations(operations)
    task_name = operations["task"]
    schema = Schema.load(abi_path)
    if task_name not in schema.tasks:
        raise ValueError(f"task is absent from the ABI schema: {task_name}")
    abi_task = schema.tasks[task_name]
    profile = load_profile(stage5_root / "profile.json")
    reports = {
        domain: _load_json(stage5_root / f"{domain}-report.json")
        for domain in ("linux", "rt")
    }
    if reports["linux"].get("contract") != reports["rt"].get("contract"):
        raise ValueError("Linux and RT Stage 5 contracts do not match")
    contract = reports["linux"]["contract"]
    candidates = {}
    for domain in ("linux", "rt"):
        group = _profile_group(profile, task_name, domain)
        report = reports[domain]
        evidence_count = report.get("evidence_count")
        windows = report.get("windows")
        if not isinstance(evidence_count, int) or not isinstance(windows, list):
            raise ValueError(f"invalid Stage 5 contract report for {domain}")
        misses = sum(window["misses"] for window in windows)
        end_to_end_p95 = group["metrics_ns"]["end_to_end"]["p95"]
        local_p95 = group["metrics_ns"]["local_execution"]["p95"]
        if end_to_end_p95 is None or local_p95 is None:
            raise ValueError(f"full timing evidence is missing for {domain}")
        candidates[domain] = {
            "evidence_count": evidence_count,
            "end_to_end_p95_ns": end_to_end_p95,
            "local_execution_p95_ns": local_p95,
            "observed_miss_rate_pct": 100 * misses / evidence_count,
            "contract_state": report.get("state"),
            "admission_allowed": operations["admission"][domain],
        }

    return {
        "schema_version": 1,
        "provenance": {
            "stage5_root": str(stage5_root),
            "profile_schema_version": profile["schema_version"],
            "contract_schema_version": reports["linux"]["schema_version"],
            "abi_schema": str(abi_path),
            "operations_basis": operations.get("basis", "unspecified"),
        },
        "policy": {
            "minimum_evidence": operations["minimum_evidence"],
            "cooldown_active": operations["cooldown_active"],
        },
        "mcu": operations["mcu"],
        "tasks": [
            {
                "name": task_name,
                "effect": f"Q_{abi_task.effect.name}",
                "current_domain": operations["current_domain"],
                "transition_hooks_declared": abi_task.transition_hooks,
                "rate_hz": operations["rate_hz"],
                "contract": {
                    "deadline_ns": contract["deadline_ns"],
                    "max_miss_rate_pct": contract["max_miss_rate_pct"],
                },
                "chain_edges": operations.get("chain_edges", []),
                "candidates": candidates,
            }
        ],
    }


def load_operations(path: Path) -> dict[str, Any]:
    return _load_json(path)


def write_recommendation_input(document: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
