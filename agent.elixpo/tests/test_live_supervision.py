"""Adaptive live Doctor supervision tests."""

from __future__ import annotations

import pytest
from lib.live_supervision import LiveDoctor, LiveSupervisionStop


def _assistant(message_id: str, tokens: int, *, tool: str = "Read", target: str = "app/page.tsx") -> dict:
    return {
        "type": "assistant",
        "message": {
            "id": message_id,
            "usage": {"input_tokens": tokens - 10, "output_tokens": 10},
            "content": [
                {
                    "type": "tool_use",
                    "name": tool,
                    "input": {"file_path": target},
                }
            ],
        },
    }


def test_live_doctor_warns_at_target_but_preserves_needed_headroom():
    receipts: list[dict] = []
    doctor = LiveDoctor(
        run_id="run-1",
        token_target=100,
        token_limit=1_000,
        emit=receipts.append,
    )

    doctor.observe(_assistant("one", 150))

    assert doctor.status == "warning"
    assert doctor.tokens == 150
    assert "token_target_exceeded_with_headroom" in doctor.warnings
    assert receipts[-1]["target_exceeded"] is True


def test_live_doctor_stops_only_at_the_absolute_limit_without_a_loop():
    doctor = LiveDoctor(run_id="run-1", token_target=100, token_limit=300)
    doctor.observe(_assistant("one", 180, target="a.py"))

    with pytest.raises(LiveSupervisionStop, match="hard_token_limit_exceeded") as caught:
        doctor.observe(_assistant("two", 130, target="b.py"))

    assert caught.value.usage.total_tokens == 310
    assert caught.value.snapshot["status"] == "stopped"


def test_live_doctor_stops_repeated_chain_with_abnormal_growth_before_hard_limit():
    doctor = LiveDoctor(run_id="run-1", token_target=100_000, token_limit=750_000)
    doctor.observe(_assistant("one", 110_000))
    doctor.observe(_assistant("two", 110_000))

    with pytest.raises(LiveSupervisionStop, match="repeated_tool_chain"):
        doctor.observe(_assistant("three", 110_000))

    assert doctor.tokens == 330_000
    assert doctor.repeated_chain_events == 1


def test_live_doctor_allows_high_cost_when_tool_work_remains_novel():
    doctor = LiveDoctor(run_id="run-1", token_target=100_000, token_limit=750_000)

    doctor.observe(_assistant("one", 150_000, target="a.py"))
    doctor.observe(_assistant("two", 150_000, target="b.py"))
    doctor.observe(_assistant("three", 150_000, tool="Edit", target="b.py"))

    assert doctor.tokens == 450_000
    assert doctor.status == "warning"
    assert doctor.stop_reason == ""


def test_live_doctor_deduplicates_replayed_message_events():
    doctor = LiveDoctor(run_id="run-1", token_target=100, token_limit=1_000)
    event = _assistant("same-message", 80)

    doctor.observe(event)
    doctor.observe(event)

    assert doctor.tokens == 80
    assert doctor.turns == 1


def test_live_doctor_enforces_authoritative_terminal_usage():
    doctor = LiveDoctor(run_id="run-1", token_target=100, token_limit=300)
    final = {
        "type": "result",
        "num_turns": 4,
        "usage": {"input_tokens": 300, "output_tokens": 20},
    }

    with pytest.raises(LiveSupervisionStop, match="hard_token_limit_exceeded"):
        doctor.complete(final)

    assert doctor.tokens == 320
    assert doctor.status == "stopped"
