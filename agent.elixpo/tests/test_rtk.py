"""rtk token-layer tests — no network. Router, budget, ledger, count, cache."""

from __future__ import annotations

import json

import pytest
from rtk import Budget, BudgetExceeded, Effort, RoleNotFound, Router, TokenLedger
from rtk.cache import prefix_hash
from rtk.count import count_messages, count_text
from rtk.models import ChatCompletionResponse, Choice, Message, PromptTokensDetails, Usage

MODELS = {
    "base_url": "https://example.test/v1",
    "defaults": {"effort": "low"},
    "roles": {
        "code": {"model": "qwen-coder-large"},
        "search": {"model": "gemini-search", "tools": False},
    },
}


class FakeClient:
    """Stand-in for LLMClient: records calls, returns a canned response."""

    def __init__(self, base_url, api_key, model, usage_total=120):
        self.model = model
        self.calls: list[dict] = []
        self._usage_total = usage_total

    async def chat(self, messages, tools=None, temperature=0.0, max_tokens=None, tool_choice=None):
        self.calls.append({"messages": messages, "tools": tools, "temperature": temperature,
                           "tool_choice": tool_choice})
        return ChatCompletionResponse(
            id="x",
            choices=[Choice(index=0, message=Message(role="assistant", content="ok"))],
            usage=Usage(
                prompt_tokens=100,
                completion_tokens=20,
                total_tokens=self._usage_total,
                prompt_tokens_details=PromptTokensDetails(cached_tokens=10),
            ),
        )

    async def close(self):
        pass


def make_router(tmp_path, **kw) -> tuple[Router, dict]:
    created: dict[str, FakeClient] = {}

    def factory(base, key, model):
        c = FakeClient(base, key, model, **kw)
        created[model] = c
        return c

    ledger = TokenLedger(tmp_path / "token_log.jsonl")
    router = Router(
        "task-1", models=MODELS, api_key="sk_test",
        client_factory=factory, ledger=ledger, budget=Budget("task-1", limit=1000),
    )
    return router, created


# --- count / cache ---

def test_count_text_and_messages():
    assert count_text("") == 0
    assert count_text("hello world") > 0
    msgs = [Message(role="user", content="hi"), Message(role="assistant", content="yo")]
    assert count_messages(msgs) >= 8  # overhead + content


def test_prefix_hash_stable():
    a = [Message(role="system", content="preamble"), Message(role="user", content="x")]
    b = [Message(role="system", content="preamble"), Message(role="user", content="DIFFERENT")]
    assert prefix_hash(a) == prefix_hash(b)  # only first message hashed
    c = [Message(role="system", content="other")]
    assert prefix_hash(a) != prefix_hash(c)


# --- budget ---

def test_budget_charge_and_ceiling():
    b = Budget("t", limit=100, kill_multiple=3.0)
    assert b.remaining() == 100
    b.charge(50)
    assert b.spent == 50 and b.remaining() == 50
    assert b.would_exceed(60) is True
    b.check(60)  # under ceiling 300 — fine
    with pytest.raises(BudgetExceeded):
        b.check(300)


# --- router ---

@pytest.mark.asyncio
async def test_router_resolves_and_charges(tmp_path):
    router, created = make_router(tmp_path, usage_total=120)
    resp = await router.call("code", [Message(role="user", content="write a fn")])
    assert resp.choices[0].message.content == "ok"
    assert "qwen-coder-large" in created
    assert router.budget.spent == 120  # charged real usage


@pytest.mark.asyncio
async def test_router_unknown_role(tmp_path):
    router, _ = make_router(tmp_path)
    with pytest.raises(RoleNotFound):
        await router.call("nope", [Message(role="user", content="x")])


@pytest.mark.asyncio
async def test_router_strips_tools_for_search_role(tmp_path):
    router, created = make_router(tmp_path)
    tool = {"type": "function", "function": {"name": "f", "description": "d", "parameters": {}}}
    await router.call("search", [Message(role="user", content="q")], tools=[tool])
    assert created["gemini-search"].calls[0]["tools"] is None


@pytest.mark.asyncio
async def test_router_effort_temperature(tmp_path):
    router, created = make_router(tmp_path)
    await router.call("code", [Message(role="user", content="x")], effort=Effort.HIGH)
    assert created["qwen-coder-large"].calls[0]["temperature"] == 0.7


@pytest.mark.asyncio
async def test_router_writes_ledger(tmp_path):
    router, _ = make_router(tmp_path)
    await router.call("code", [Message(role="user", content="x")])
    rows = [json.loads(line) for line in (tmp_path / "token_log.jsonl").read_text().splitlines()]
    assert rows[0]["role"] == "code"
    assert rows[0]["model"] == "qwen-coder-large"
    assert rows[0]["cached_tokens"] == 10
    assert rows[0]["total_tokens"] == 120


def test_router_accounts_for_ccr_harness_usage(tmp_path):
    router, _ = make_router(tmp_path)
    usage = Usage(prompt_tokens=70, completion_tokens=20, total_tokens=90)

    assert router.record_external_usage("code", usage, source="ccr-node-harness", extra={"turns": 4}) == 90

    row = json.loads((tmp_path / "token_log.jsonl").read_text().splitlines()[0])
    assert row["source"] == "ccr-node-harness"
    assert row["turns"] == 4
    assert row["total_tokens"] == 90


# --- savers: truncate / diff / cache backends ---

def test_truncate_preserves_head_and_tail():
    from rtk.truncate import truncate_text

    text = "HEAD " + ("noise " * 5000) + "TAIL"
    out = truncate_text(text, max_tokens=100)
    assert out.startswith("HEAD")
    assert out.rstrip().endswith("TAIL")
    assert "elided" in out
    assert len(out) < len(text)


def test_diff_cheaper_than_full():
    from rtk.diff_context import cheaper_as_diff

    old = "\n".join(f"line {i}" for i in range(200))
    new = old.replace("line 5", "line 5 CHANGED")
    use_diff, payload = cheaper_as_diff(old, new, "f.py")
    assert use_diff is True
    assert "CHANGED" in payload and payload.startswith("---")


def test_cache_backends():
    from rtk.cache import MemoryCache, NullCache, cache_key

    n = NullCache()
    n.set("k", "v")
    assert n.get("k") is None

    m = MemoryCache()
    m.set("k", "v")
    assert m.get("k") == "v"

    assert cache_key("emb", "abc") == cache_key("emb", "abc")
    assert cache_key("emb", "abc") != cache_key("emb", "xyz")
