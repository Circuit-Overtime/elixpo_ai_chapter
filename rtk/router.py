"""Role → model router over Pollinations, with budget + ledger built in.

Squads ask for a ROLE ("code", "triage", ...); the router resolves the model
from config/models.yaml, calls Pollinations, charges the budget, and records the
real usage to the ledger. Every model call in the system goes through here.

Designed for injection so each squad is testable in isolation:

    router = Router(task_id="t", models={"roles": {"code": {"model": "x"}}},
                    client_factory=fake_factory, ledger=fake_ledger)

With no injection it builds itself from global settings + config/models.yaml.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
import yaml

from rtk.budget import Budget, BudgetExceeded
from rtk.client import LLMClient
from rtk.count import count_messages
from rtk.ledger import TokenLedger
from rtk.models import ChatCompletionResponse, Message, ToolDef, Usage

log = structlog.get_logger()


class Effort(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


EFFORT_TEMPERATURE: dict[Effort, float] = {
    Effort.LOW: 0.1,
    Effort.MEDIUM: 0.3,
    Effort.HIGH: 0.7,
}


class RoleNotFound(KeyError):
    """The requested role is not defined in models.yaml."""


ClientFactory = Callable[[str, str, str], LLMClient]  # (base_url, api_key, model) -> client


def load_models_config(path: str | Path) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text())


class Router:
    def __init__(
        self,
        task_id: str,
        *,
        models: dict[str, Any],
        api_key: str,
        budget: Budget | None = None,
        client_factory: ClientFactory | None = None,
        ledger: TokenLedger | None = None,
        default_effort: Effort = Effort.MEDIUM,
    ):
        self.task_id = task_id
        self._models = models
        self._roles: dict[str, dict] = models.get("roles", {})
        self._base_url = models.get("base_url", "https://gen.pollinations.ai/v1")
        self._api_key = api_key
        self.budget = budget or Budget(task_id)
        self._factory: ClientFactory = client_factory or (
            lambda base, key, model: LLMClient(api_url=base, api_key=key, model=model)
        )
        self.ledger = ledger
        self._default_effort = default_effort
        self._clients: dict[str, LLMClient] = {}

    # --- construction from global config ---

    @classmethod
    def from_settings(cls, task_id: str, budget: Budget | None = None, **kw) -> Router:
        from lib.config import settings  # local import keeps rtk importable without config

        models = load_models_config(settings.config_dir / "models.yaml")
        ledger = TokenLedger(settings.state_dir / "token_log.jsonl")
        return cls(
            task_id,
            models=models,
            api_key=settings.pollinations.api_key,
            budget=budget,
            ledger=ledger,
            **kw,
        )

    # --- resolution ---

    def resolve(self, role: str) -> dict[str, Any]:
        spec = self._roles.get(role)
        if spec is None:
            raise RoleNotFound(f"role {role!r} not in models.yaml (have: {sorted(self._roles)})")
        return spec

    def _client(self, model: str) -> LLMClient:
        if model not in self._clients:
            self._clients[model] = self._factory(self._base_url, self._api_key, model)
        return self._clients[model]

    # --- the one entrypoint ---

    async def call(
        self,
        role: str,
        messages: list[Message],
        tools: list[ToolDef] | None = None,
        effort: Effort | str | None = None,
        max_tokens: int | None = None,
        tool_choice: str | dict | None = None,
    ) -> ChatCompletionResponse:
        spec = self.resolve(role)
        model = spec["model"]
        if spec.get("tools") is False:
            tools = None
            tool_choice = None

        if effort:
            eff = Effort(effort)
        else:
            eff = Effort(self._models.get("defaults", {}).get("effort", self._default_effort))
        temperature = EFFORT_TEMPERATURE[eff]

        # pre-call budget gate (estimate)
        est = count_messages(messages)
        self.budget.check(est)

        resp = await self._client(model).chat(
            messages=messages, tools=tools, temperature=temperature,
            max_tokens=max_tokens, tool_choice=tool_choice,
        )

        # charge real usage (fall back to estimate if the provider omits usage)
        used = resp.usage.total_tokens or est
        self.budget.charge(used)
        if self.ledger is not None:
            self.ledger.record(task_id=self.task_id, role=role, model=model, usage=resp.usage)

        log.debug(
            "rtk.call", role=role, model=model, effort=eff.value,
            used=used, spent=self.budget.spent, remaining=self.budget.remaining(),
        )
        return resp

    async def stream(
        self,
        role: str,
        messages: list[Message],
        tools: list[ToolDef] | None = None,
        effort: Effort | str | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[Any]:
        """Stream provider chunks while preserving budget and ledger accounting."""
        spec = self.resolve(role)
        model = spec["model"]
        if spec.get("tools") is False:
            tools = None
        eff = Effort(effort) if effort else Effort(
            self._models.get("defaults", {}).get("effort", self._default_effort)
        )
        temperature = EFFORT_TEMPERATURE[eff]
        estimated_input = count_messages(messages)
        self.budget.check(estimated_input)
        completion_chars = 0
        final_usage = None
        completed = False
        try:
            async for chunk in self._client(model).chat_stream(
                messages=messages, tools=tools, temperature=temperature, max_tokens=max_tokens,
            ):
                if chunk.usage and chunk.usage.total_tokens:
                    final_usage = chunk.usage
                for choice in chunk.choices:
                    completion_chars += len(choice.delta.content or "")
                yield chunk
            completed = True
        finally:
            if completed:
                estimated_output = max(0, completion_chars // 4)
                usage = final_usage or Usage(
                    prompt_tokens=estimated_input,
                    completion_tokens=estimated_output,
                    total_tokens=estimated_input + estimated_output,
                )
                used = usage.total_tokens or estimated_input
                self.budget.charge(used)
                if self.ledger is not None:
                    self.ledger.record(task_id=self.task_id, role=role, model=model, usage=usage)
                log.debug(
                    "rtk.stream", role=role, model=model, effort=eff.value,
                    used=used, spent=self.budget.spent, remaining=self.budget.remaining(),
                )

    def record_external_usage(
        self,
        role: str,
        usage: Usage,
        *,
        source: str,
        extra: dict[str, Any] | None = None,
    ) -> int:
        """Account for a supervised harness session that routes through CCR."""
        spec = self.resolve(role)
        used = max(0, int(usage.total_tokens))
        self.budget.charge(used)
        details = {"source": source, **(extra or {})}
        if self.ledger is not None:
            self.ledger.record(
                task_id=self.task_id,
                role=role,
                model=spec["model"],
                usage=usage,
                extra=details,
            )
        log.debug(
            "rtk.external",
            role=role,
            model=spec["model"],
            source=source,
            used=used,
            spent=self.budget.spent,
            remaining=self.budget.remaining(),
        )
        if self.budget.spent > self.budget.ceiling:
            raise BudgetExceeded(
                f"{self.task_id}: external harness spent {self.budget.spent} tokens, "
                f"breaching ceiling {self.budget.ceiling}"
            )
        return self.budget.spent

    async def aclose(self) -> None:
        for c in self._clients.values():
            await c.close()
