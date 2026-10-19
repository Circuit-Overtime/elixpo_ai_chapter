"""Context window manager — tracks tokens, compresses older messages."""

from __future__ import annotations

from rtk.models import Message


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English text."""
    return len(text) // 4


def message_tokens(msg: Message) -> int:
    """Estimate token count for a single message."""
    total = 4  # overhead per message
    if msg.content:
        total += estimate_tokens(msg.content)
    if msg.tool_calls:
        for tc in msg.tool_calls:
            total += estimate_tokens(tc.function.name)
            total += estimate_tokens(tc.function.arguments)
    return total


def total_tokens(messages: list[Message]) -> int:
    return sum(message_tokens(m) for m in messages)


class ContextManager:
    """Manages the context window for the agent loop.

    When messages approach the token limit, older messages are compressed
    into a summary while preserving the system prompt, current plan,
    and recent messages.
    """

    def __init__(
        self,
        max_tokens: int = 128_000,
        compression_threshold: float = 0.8,
        working_memory_budget: int = 0,
    ):
        self.max_tokens = max_tokens
        self.compression_threshold = compression_threshold
        self.working_memory_budget = working_memory_budget

    def set_working_memory_budget(self, tokens: int) -> None:
        """Update the working memory token budget (reduces available context)."""
        self.working_memory_budget = tokens

    def available_tokens(self) -> int:
        """Tokens available for conversation after working memory."""
        return self.max_tokens - self.working_memory_budget

    def needs_compression(self, messages: list[Message]) -> bool:
        current = total_tokens(messages)
        return current > self.available_tokens() * self.compression_threshold

    def compress(self, messages: list[Message], keep_recent: int = 10) -> list[Message]:
        """Compress older messages into a summary.

        Keeps:
          - System message (index 0)
          - Last `keep_recent` messages
        Replaces everything in between with a summary message.
        """
        if len(messages) <= keep_recent + 1:
            return messages

        system_msg = messages[0] if messages[0].role == "system" else None
        recent = messages[-keep_recent:]

        # Messages to summarize
        start = 1 if system_msg else 0
        end = len(messages) - keep_recent
        to_summarize = messages[start:end]

        if not to_summarize:
            return messages

        # Build a condensed summary
        summary_parts = ["[CONTEXT SUMMARY - Previous conversation compressed]"]
        for msg in to_summarize:
            if msg.role == "assistant" and msg.content:
                summary_parts.append(f"Assistant: {msg.content[:200]}")
            elif msg.role == "tool" and msg.content:
                tool_id = msg.tool_call_id or "unknown"
                summary_parts.append(f"Tool({tool_id}): {msg.content[:100]}")
            elif msg.role == "user" and msg.content:
                summary_parts.append(f"User: {msg.content[:200]}")

        summary_text = "\n".join(summary_parts)
        summary_msg = Message(role="user", content=summary_text)

        result = []
        if system_msg:
            result.append(system_msg)
        result.append(summary_msg)
        result.extend(recent)
        return result
