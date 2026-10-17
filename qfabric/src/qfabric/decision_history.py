from __future__ import annotations

import fcntl
import hashlib
import json
import os
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TextIO

DECISION_SCHEMA_VERSION = 1
GENESIS_SHA256 = "0" * 64
DECISION_KINDS = {"recommendation", "recovery"}


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _json_copy(value: Any) -> Any:
    return json.loads(_canonical(value))


def _record_sha256(record: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in record.items() if key != "record_sha256"}
    return hashlib.sha256(_canonical(unsigned).encode("utf-8")).hexdigest()


def _parse_records(handle: TextIO, path: Path) -> list[dict[str, Any]]:
    handle.seek(0)
    records = []
    previous = GENESIS_SHA256
    for line_number, line in enumerate(handle, start=1):
        if not line.endswith("\n"):
            raise ValueError(f"decision history has a truncated line at {path}:{line_number}")
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"decision history contains invalid JSON at {path}:{line_number}"
            ) from error
        if not isinstance(record, dict):
            raise ValueError(f"decision history record is not an object at {path}:{line_number}")
        expected_fields = {
            "schema_version",
            "decision_id",
            "recorded_utc",
            "kind",
            "task",
            "policy",
            "input",
            "outcome",
            "facts",
            "previous_record_sha256",
            "record_sha256",
        }
        if set(record) != expected_fields:
            raise ValueError(f"decision history fields are invalid at {path}:{line_number}")
        if record["schema_version"] != DECISION_SCHEMA_VERSION:
            raise ValueError(f"unsupported decision schema at {path}:{line_number}")
        if record["decision_id"] != line_number:
            raise ValueError(f"decision IDs are not contiguous at {path}:{line_number}")
        if record["kind"] not in DECISION_KINDS:
            raise ValueError(f"decision kind is invalid at {path}:{line_number}")
        if not isinstance(record["task"], str) or not record["task"]:
            raise ValueError(f"decision task is invalid at {path}:{line_number}")
        policy = record["policy"]
        if (
            not isinstance(policy, dict)
            or not isinstance(policy.get("name"), str)
            or not isinstance(policy.get("version"), int)
            or policy["version"] < 1
        ):
            raise ValueError(f"decision policy is invalid at {path}:{line_number}")
        if record["previous_record_sha256"] != previous:
            raise ValueError(f"decision hash chain is broken at {path}:{line_number}")
        digest = _record_sha256(record)
        if record["record_sha256"] != digest:
            raise ValueError(f"decision record was modified at {path}:{line_number}")
        previous = digest
        records.append(record)
    return records


class DecisionStore:
    def __init__(
        self,
        path: Path,
        *,
        clock: Callable[[], datetime] | None = None,
    ):
        self.path = path
        self.clock = clock or (lambda: datetime.now(UTC))

    def load(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_SH)
            try:
                return _json_copy(_parse_records(handle, self.path))
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def append(
        self,
        *,
        kind: str,
        task: str,
        policy_name: str,
        policy_version: int,
        decision_input: dict[str, Any],
        outcome: dict[str, Any],
        facts: dict[str, Any],
    ) -> dict[str, Any]:
        if kind not in DECISION_KINDS:
            raise ValueError("decision kind must be recommendation or recovery")
        if not task:
            raise ValueError("decision task must not be empty")
        if not policy_name or policy_version < 1:
            raise ValueError("decision policy name and positive version are required")
        captured = self.clock()
        if captured.tzinfo is None or captured.utcoffset() is None:
            raise ValueError("decision clock must return a timezone-aware datetime")

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a+", encoding="utf-8") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                records = _parse_records(handle, self.path)
                record = {
                    "schema_version": DECISION_SCHEMA_VERSION,
                    "decision_id": len(records) + 1,
                    "recorded_utc": captured.astimezone(UTC).isoformat(),
                    "kind": kind,
                    "task": task,
                    "policy": {"name": policy_name, "version": policy_version},
                    "input": _json_copy(decision_input),
                    "outcome": _json_copy(outcome),
                    "facts": _json_copy(facts),
                    "previous_record_sha256": (
                        records[-1]["record_sha256"] if records else GENESIS_SHA256
                    ),
                }
                record["record_sha256"] = _record_sha256(record)
                handle.seek(0, os.SEEK_END)
                handle.write(_canonical(record) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
                return _json_copy(record)
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def get(self, decision_id: int) -> dict[str, Any]:
        if decision_id < 1:
            raise ValueError("decision_id must be positive")
        records = self.load()
        if decision_id > len(records):
            raise ValueError(f"decision {decision_id} was not found")
        return records[decision_id - 1]

    def latest(self, task: str) -> dict[str, Any]:
        matches = [record for record in self.load() if record["task"] == task]
        if not matches:
            raise ValueError(f"no decisions were found for task {task}")
        return matches[-1]
