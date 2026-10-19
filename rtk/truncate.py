"""Output/context governor — cap oversized text to a token budget.

Keeps the head and tail (where errors and conclusions live) and elides the
middle, which is where repetitive build/test noise piles up. Used on tool
output and any model input that might blow past a budget.
"""

from __future__ import annotations

from rtk.count import count_text

_ELISION = "\n... [{n} tokens elided] ...\n"


def truncate_text(text: str, max_tokens: int, head_frac: float = 0.6) -> str:
    """Return text trimmed to ~max_tokens, preserving head and tail."""
    total = count_text(text)
    if total <= max_tokens:
        return text
    # work in characters proportionally (counting is approximate anyway)
    keep_chars = int(len(text) * (max_tokens / total))
    head_n = int(keep_chars * head_frac)
    tail_n = keep_chars - head_n
    elided = total - max_tokens
    return text[:head_n] + _ELISION.format(n=elided) + (text[-tail_n:] if tail_n else "")
