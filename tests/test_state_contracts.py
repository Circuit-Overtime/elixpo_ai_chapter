"""Shared state boundary contract tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from lib.state.contracts import StateBoundaryError, StateContractRegistry
from lib.state.store import StateStore
from pydantic import ValidationError


def test_versioned_round_trip_keeps_payload_shape(tmp_path):
    store = StateStore(tmp_path)
    now = datetime(2026, 8, 9, tzinfo=timezone.utc)
    payload = {"status": "approved", "key": "elixpo/repo#7", "run_id": "run-7"}

    contract = store.write_state("vet.json", payload, producer="vet", now=now)

    assert store.read_json("vet.json") == payload
    assert store.read_state(
        "vet.json",
        expected_producer="vet",
        expected_key="elixpo/repo#7",
        expected_run_id="run-7",
        now=now,
    ) == payload
    assert contract.sequence == 1


def test_rewrite_increments_sequence_and_invalidates_old_payload(tmp_path):
    store = StateStore(tmp_path)
    first = {"status": "pending_vet", "key": "elixpo/repo#7"}
    second = {"status": "picked", "key": "elixpo/repo#7"}
    store.write_state("pick.json", first, producer="pick")
    contract = store.write_state("pick.json", second, producer="vet")

    assert contract.sequence == 2
    assert store.read_state("pick.json", expected_producer="vet") == second

    store.write_json("pick.json", first)
    with pytest.raises(StateBoundaryError, match="digest"):
        store.read_state("pick.json")


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"expected_producer": "solve"}, "produced by"),
        ({"expected_run_id": "other"}, "run"),
        ({"expected_key": "other/repo#1"}, "key"),
    ],
)
def test_boundary_rejects_identity_mismatch(tmp_path, kwargs, message):
    store = StateStore(tmp_path)
    store.write_state(
        "vet.json",
        {"status": "approved", "key": "elixpo/repo#7", "run_id": "run-7"},
        producer="vet",
    )
    with pytest.raises(StateBoundaryError, match=message):
        store.read_state("vet.json", **kwargs)


def test_boundary_rejects_stale_and_expired_contracts(tmp_path):
    store = StateStore(tmp_path)
    now = datetime(2026, 8, 9, tzinfo=timezone.utc)
    store.write_state(
        "pick.json",
        {"status": "pending_vet"},
        producer="pick",
        ttl=timedelta(minutes=30),
        now=now,
    )
    later = now + timedelta(hours=1)
    with pytest.raises(StateBoundaryError, match="older"):
        store.read_state("pick.json", max_age=timedelta(minutes=15), now=later)
    with pytest.raises(StateBoundaryError, match="expired"):
        store.read_state("pick.json", now=later)


def test_uncontracted_state_is_always_rejected(tmp_path):
    store = StateStore(tmp_path)
    payload = [{"repo": "elixpo/repo"}]
    store.write_json("triaged.json", payload)
    with pytest.raises(StateBoundaryError, match="no versioned contract"):
        store.read_state("triaged.json")


def test_unknown_future_registry_schema_fails_closed(tmp_path):
    store = StateStore(tmp_path)
    store.write_json("contracts.json", {"schema_version": 99, "contracts": {}})
    with pytest.raises(ValidationError):
        StateContractRegistry.model_validate(store.read_json("contracts.json"))
