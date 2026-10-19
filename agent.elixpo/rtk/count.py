"""Pre-call token counting via tiktoken, with a cheap fallback.

Counting is approximate across providers (Pollinations fronts many model
families); we use it only for budget gating and context-shrink decisions, not
for billing — the ledger records the real usage returned by the API.
"""

from __future__ import annotations

from functools import lru_cache

from rtk.models import Message

_PER_MESSAGE_OVERHEAD = 4  # role + delimiters, OpenAI-style


@lru_cache(maxsize=4)
def _encoder(name: str = "o200k_base"):
    try:
        import tiktoken

        return tiktoken.get_encoding(name)
    except Exception:
        return None


def count_text(text: str, encoding: str = "o200k_base") -> int:
    if not text:
        return 0
    enc = _encoder(encoding)
    if enc is None:
        return max(1, len(text) // 4)  # ~4 chars/token fallback
    return len(enc.encode(text))


def count_messages(messages: list[Message], encoding: str = "o200k_base") -> int:
    total = 0
    for m in messages:
        total += _PER_MESSAGE_OVERHEAD
        if m.content:
            total += count_text(m.content, encoding)
        if m.tool_calls:
            for tc in m.tool_calls:
                total += count_text(tc.function.name, encoding)
                total += count_text(tc.function.arguments, encoding)
    return total
