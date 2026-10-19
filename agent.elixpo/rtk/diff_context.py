"""Send diffs, not whole files.

When the model already saw a file (or it's large and only partly changed), a
unified diff is far cheaper than re-sending the full content. Pure stdlib.
"""

from __future__ import annotations

import difflib

from rtk.count import count_text


def unified(old: str, new: str, path: str = "file", context: int = 3) -> str:
    diff = difflib.unified_diff(
        old.splitlines(keepends=True),
        new.splitlines(keepends=True),
        fromfile=f"a/{path}",
        tofile=f"b/{path}",
        n=context,
    )
    return "".join(diff)


def cheaper_as_diff(old: str, new: str, path: str = "file") -> tuple[bool, str]:
    """Return (use_diff, payload): the diff if it's smaller than the full new file."""
    d = unified(old, new, path)
    return (count_text(d) < count_text(new), d)
