"""Versioned, hash-bound contracts for squad state files.

Payload shapes stay unchanged so operators and existing workflows can inspect
them directly. ``state/contracts.json`` binds each payload to its producer and
execution identity; consumers fail closed when the payload and contract diverge.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

CONTRACTS_FILE = "contracts.json"
CONTRACT_SCHEMA_VERSION = 1


class StateBoundaryError(RuntimeError):
    """A state file cannot safely cross into the next squad."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def payload_digest(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


class StateContract(BaseModel):
    schema_version: Literal[1] = CONTRACT_SCHEMA_VERSION
    state_file: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_.-]+\.json$")
    producer: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9_-]*$")
    produced_at: str
    payload_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    sequence: int = Field(default=1, ge=1)
    run_id: str = ""
    key: str = ""
    status: str = ""
    expires_at: str = ""


class StateContractRegistry(BaseModel):
    schema_version: Literal[1] = CONTRACT_SCHEMA_VERSION
    contracts: dict[str, StateContract] = Field(default_factory=dict)
    updated_at: str = ""


def _identity(payload: Any, field: str) -> str:
    if not isinstance(payload, dict):
        return ""
    return str(payload.get(field) or "")


def write_versioned(
    store,
    name: str,
    payload: Any,
    *,
    producer: str,
    run_id: str | None = None,
    key: str | None = None,
    status: str | None = None,
    ttl: timedelta | None = None,
    now: datetime | None = None,
) -> StateContract:
    """Write a payload, then publish its integrity contract as the commit point."""
    if name == CONTRACTS_FILE:
        raise ValueError("contracts.json cannot contract itself")
    current = now or utc_now()
    registry = StateContractRegistry.model_validate(store.read_json(CONTRACTS_FILE, {}) or {})
    previous = registry.contracts.get(name)
    contract = StateContract(
        state_file=name,
        producer=producer,
        produced_at=current.isoformat(),
        payload_sha256=payload_digest(payload),
        sequence=(previous.sequence + 1) if previous else 1,
        run_id=run_id if run_id is not None else _identity(payload, "run_id"),
        key=key if key is not None else _identity(payload, "key"),
        status=status if status is not None else _identity(payload, "status"),
        expires_at=(current + ttl).isoformat() if ttl else "",
    )
    store.write_json(name, payload)
    registry.contracts[name] = contract
    registry.updated_at = current.isoformat()
    store.write_json(CONTRACTS_FILE, registry.model_dump(mode="json"))
    return contract


def read_versioned(
    store,
    name: str,
    default: Any = None,
    *,
    expected_producer: str | set[str] | None = None,
    expected_run_id: str | None = None,
    expected_key: str | None = None,
    max_age: timedelta | None = None,
    now: datetime | None = None,
) -> Any:
    """Read one payload only after its sidecar contract passes boundary checks."""
    payload = store.read_json(name, default)
    registry = StateContractRegistry.model_validate(store.read_json(CONTRACTS_FILE, {}) or {})
    contract = registry.contracts.get(name)
    if contract is None:
        raise StateBoundaryError(f"state/{name} has no versioned contract")
    if contract.state_file != name:
        raise StateBoundaryError(f"state/{name} contract names {contract.state_file!r}")
    if payload_digest(payload) != contract.payload_sha256:
        raise StateBoundaryError(f"state/{name} payload does not match its contract digest")
    producers = (
        {expected_producer}
        if isinstance(expected_producer, str)
        else set(expected_producer or ())
    )
    if producers and contract.producer not in producers:
        raise StateBoundaryError(
            f"state/{name} was produced by {contract.producer!r}; expected {sorted(producers)}"
        )
    if expected_run_id is not None and contract.run_id != expected_run_id:
        raise StateBoundaryError(
            f"state/{name} run {contract.run_id!r} does not match {expected_run_id!r}"
        )
    if expected_key is not None and contract.key != expected_key:
        raise StateBoundaryError(f"state/{name} key {contract.key!r} does not match {expected_key!r}")
    current = now or utc_now()
    produced_at = parse_time(contract.produced_at)
    if max_age is not None and current - produced_at > max_age:
        raise StateBoundaryError(f"state/{name} contract is older than {max_age}")
    if contract.expires_at and parse_time(contract.expires_at) <= current:
        raise StateBoundaryError(f"state/{name} contract expired at {contract.expires_at}")
    return payload
