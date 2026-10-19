"""Async helpers shared by squads."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import TypeVar

T = TypeVar("T")


async def gather_safe(coros: list[Awaitable[T]], default: T) -> list[T]:
    """gather that never raises: a failed coroutine becomes `default`.

    Keeps one flaky GitHub/LLM call (e.g. a 504) from failing the whole squad —
    that item is dropped, the run continues.
    """
    results = await asyncio.gather(*coros, return_exceptions=True)
    return [default if isinstance(r, BaseException) else r for r in results]
