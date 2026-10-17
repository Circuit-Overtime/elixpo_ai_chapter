from __future__ import annotations

import json
from typing import Any


def explain_decision(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "decision_id": record["decision_id"],
        "record_sha256": record["record_sha256"],
        "previous_record_sha256": record["previous_record_sha256"],
        "recorded_utc": record["recorded_utc"],
        "kind": record["kind"],
        "task": record["task"],
        "policy": record["policy"],
        "input": record["input"],
        "outcome": record["outcome"],
        "facts": record["facts"],
    }


def _flatten(value: Any, path: str) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        result = []
        for key in sorted(value):
            child = f"{path}.{key}" if path else key
            result.extend(_flatten(value[key], child))
        return result
    if isinstance(value, list):
        result = []
        for index, item in enumerate(value):
            result.extend(_flatten(item, f"{path}[{index}]"))
        if not value:
            result.append((path, []))
        return result
    return [(path, value)]


def render_explanation(explanation: dict[str, Any]) -> str:
    lines = [
        f"QFabric decision {explanation['decision_id']}",
        f"- task: {explanation['task']}",
        f"- kind: {explanation['kind']}",
        f"- policy: {explanation['policy']['name']}-v{explanation['policy']['version']}",
        f"- recorded UTC: {explanation['recorded_utc']}",
        f"- record SHA-256: {explanation['record_sha256']}",
        "Decision evidence",
    ]
    lines.extend(explanation_evidence_lines(explanation))
    return "\n".join(lines)


def explanation_evidence_lines(explanation: dict[str, Any]) -> list[str]:
    complete_facts = {
        "facts": explanation["facts"],
        "input": explanation["input"],
        "outcome": explanation["outcome"],
        "previous_record_sha256": explanation["previous_record_sha256"],
        "schema_version": explanation["schema_version"],
    }
    return [
        f"- {path}: {json.dumps(value, sort_keys=True)}"
        for path, value in _flatten(complete_facts, "")
    ]


def render_replay(report: dict[str, Any]) -> str:
    return "\n".join(
        (
            f"QFabric decision replay {report['decision_id']}",
            f"- task: {report['task']}",
            f"- kind: {report['kind']}",
            f"- policy: {report['policy']['name']}-v{report['policy']['version']}",
            f"- recorded SHA-256: {report['record_sha256']}",
            f"- exact outcome match: {str(report['matches']).lower()}",
            f"- status: {report['status']}",
        )
    )
