"""gather_safe — a failing coroutine becomes the default, others still complete."""

from __future__ import annotations

import pytest
from lib.aio import gather_safe


@pytest.mark.asyncio
async def test_gather_safe_isolates_failures():
    async def ok(x):
        return x

    async def boom():
        raise RuntimeError("504")

    out = await gather_safe([ok(1), boom(), ok(3)], default=None)
    assert out == [1, None, 3]
