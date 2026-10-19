"""Adaptive, deterministic supervision for a running coding harness."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from rtk.models import PromptTokensDetails, Usage


class LiveSupervisionStop(RuntimeError):
    """Raised only when a live run crosses a non-negotiable safety boundary."""

    def __init__(self, message: str, *, usage: Usage, snapshot: dict[str, Any]):
        super().__init__(message)
        self.usage = usage
        self.snapshot = snapshot


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _event_usage(event: dict[str, Any]) -> Usage:
    message = event.get("message") if isinstance(event.get("message"), dict) else {}
    raw = message.get("usage") or event.get("usage") or {}
    prompt = int(raw.get("input_tokens") or raw.get("prompt_tokens") or 0)
    prompt += int(raw.get("cache_creation_input_tokens") or 0)
    cached = int(raw.get("cache_read_input_tokens") or raw.get("cached_tokens") or 0)
    completion = int(raw.get("output_tokens") or raw.get("completion_tokens") or 0)
    total = int(raw.get("total_tokens") or (prompt + cached + completion))
    return Usage(
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=total,
        prompt_tokens_details=PromptTokensDetails(cached_tokens=cached),
    )


def _tool_signatures(event: dict[str, Any]) -> list[tuple[str, str]]:
    if event.get("type") != "assistant":
        return []
    message = event.get("message") or {}
    blocks = message.get("content") or []
    found: list[tuple[str, str]] = []
    for block in blocks if isinstance(blocks, list) else []:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        name = str(block.get("name") or "unknown")
        raw_input = block.get("input") if isinstance(block.get("input"), dict) else {}
        material = json.dumps(raw_input, sort_keys=True, separators=(",", ":"), default=str)
        signature = hashlib.sha256(f"{name}|{material}".encode()).hexdigest()[:16]
        found.append((name, signature))
    return found


@dataclass
class LiveDoctor:
    """Observe streamed usage and tool choices without imposing a soft-budget stop."""

    run_id: str
    token_target: int
    token_limit: int
    abnormal_token_ratio: float = 2.0
    abnormal_token_extra: int = 100_000
    emit: Callable[[dict[str, Any]], None] | None = None
    tokens: int = 0
    prompt_tokens: int = 0
    cached_tokens: int = 0
    completion_tokens: int = 0
    turns: int = 0
    tool_calls: int = 0
    edit_calls: int = 0
    repeated_chain_events: int = 0
    recent_tools: list[str] = field(default_factory=list)
    seen_messages: set[str] = field(default_factory=set)
    warnings: list[str] = field(default_factory=list)
    status: str = "running"
    stop_reason: str = ""

    def _warn(self, code: str) -> None:
        if code not in self.warnings:
            self.warnings.append(code)
            print(f"[doctor] warning={code} tokens={self.tokens} tools={self.tool_calls}", flush=True)

    def _usage(self) -> Usage:
        return Usage(
            prompt_tokens=self.prompt_tokens,
            completion_tokens=self.completion_tokens,
            total_tokens=self.tokens,
            prompt_tokens_details=PromptTokensDetails(cached_tokens=self.cached_tokens),
        )

    def _loop_token_threshold(self) -> int:
        return min(
            self.token_limit,
            max(
                int(self.token_target * max(1.0, self.abnormal_token_ratio)),
                self.token_target + max(1, self.abnormal_token_extra),
            ),
        )

    def snapshot(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "run_id": self.run_id,
            "status": self.status,
            "token_spent_observed": self.tokens,
            "token_target": self.token_target,
            "token_limit": self.token_limit,
            "loop_token_stop_threshold": self._loop_token_threshold(),
            "target_exceeded": self.tokens > self.token_target,
            "turns_observed": self.turns,
            "tool_calls": self.tool_calls,
            "edit_calls": self.edit_calls,
            "repeated_chain_events": self.repeated_chain_events,
            "warnings": self.warnings[-10:],
            "stop_reason": self.stop_reason,
            "updated_at": _stamp(),
        }

    def _publish(self) -> dict[str, Any]:
        snapshot = self.snapshot()
        if self.emit is not None:
            self.emit(snapshot)
        return snapshot

    def start(self) -> dict[str, Any]:
        """Publish the initial running receipt before the first model request."""
        return self._publish()

    def observe(self, event: dict[str, Any]) -> None:
        event_type = str(event.get("type") or "")
        if event_type == "assistant":
            message = event.get("message") or {}
            message_id = str(message.get("id") or event.get("uuid") or "")
            if not message_id:
                message_id = hashlib.sha256(
                    json.dumps(event, sort_keys=True, default=str).encode()
                ).hexdigest()
            if message_id not in self.seen_messages:
                self.seen_messages.add(message_id)
                usage = _event_usage(event)
                self.prompt_tokens += usage.prompt_tokens
                self.cached_tokens += usage.cached_tokens
                self.completion_tokens += usage.completion_tokens
                self.tokens += usage.total_tokens
                self.turns += 1

            for name, signature in _tool_signatures(event):
                self.tool_calls += 1
                if name in {"Edit", "Write"}:
                    self.edit_calls += 1
                self.recent_tools.append(signature)
                self.recent_tools = self.recent_tools[-8:]

            recent = self.recent_tools
            exact_loop = len(recent) >= 3 and len(set(recent[-3:])) == 1
            alternating_loop = (
                len(recent) >= 6
                and recent[-6] == recent[-4] == recent[-2]
                and recent[-5] == recent[-3] == recent[-1]
            )
            if exact_loop or alternating_loop:
                self.repeated_chain_events += 1
                self._warn("repeated_tool_chain")

        if event_type not in {"assistant", "result"}:
            return

        if self.tokens > self.token_target:
            self._warn("token_target_exceeded_with_headroom")

        abnormal_threshold = self._loop_token_threshold()
        loop_is_burning_budget = self.repeated_chain_events > 0 and self.tokens > abnormal_threshold
        hard_limit_crossed = self.tokens > self.token_limit
        if hard_limit_crossed or loop_is_burning_budget:
            self.status = "stopped"
            self.stop_reason = (
                "hard_token_limit_exceeded" if hard_limit_crossed else "repeated_tool_chain_with_abnormal_token_growth"
            )
            snapshot = self._publish()
            raise LiveSupervisionStop(
                f"live Doctor stopped harness: {self.stop_reason}",
                usage=self._usage(),
                snapshot=snapshot,
            )
        self.status = "warning" if self.warnings else "running"
        self._publish()

    def complete(self, final_event: dict[str, Any] | None) -> dict[str, Any]:
        if final_event:
            final_usage = _event_usage(final_event)
            # The result envelope is authoritative and already aggregates the
            # session. Never add it to per-turn observations.
            if final_usage.total_tokens > 0:
                self.prompt_tokens = final_usage.prompt_tokens
                self.cached_tokens = final_usage.cached_tokens
                self.completion_tokens = final_usage.completion_tokens
                self.tokens = final_usage.total_tokens
            self.turns = max(self.turns, int(final_event.get("num_turns") or 0))
        hard_limit_crossed = self.tokens > self.token_limit
        loop_is_burning_budget = (
            self.repeated_chain_events > 0 and self.tokens > self._loop_token_threshold()
        )
        if hard_limit_crossed or loop_is_burning_budget:
            self.status = "stopped"
            self.stop_reason = (
                "hard_token_limit_exceeded" if hard_limit_crossed else "repeated_tool_chain_with_abnormal_token_growth"
            )
            snapshot = self._publish()
            raise LiveSupervisionStop(
                f"live Doctor stopped harness: {self.stop_reason}",
                usage=self._usage(),
                snapshot=snapshot,
            )
        self.status = "terminal"
        return self._publish()

    def merge_gate_state(self, state: dict[str, Any]) -> dict[str, Any]:
        """Merge authoritative hook counters into the terminal live receipt."""
        self.tool_calls = max(self.tool_calls, int(state.get("live_tool_calls") or 0))
        strikes = int(state.get("live_loop_strikes") or 0)
        self.repeated_chain_events = max(self.repeated_chain_events, strikes)
        if strikes:
            self._warn("repeated_tool_chain")
        return self._publish()
