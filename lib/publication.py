"""Shared safety gate for deterministic public GitHub publications."""

from __future__ import annotations

import re

from rtk.models import Message


class UnsafePublication(RuntimeError):
    pass


async def safety_check(router, body: str) -> None:
    response = await router.call(
        "safety",
        [
            Message(
                role="system",
                content=(
                    "Moderate this public GitHub publication. Return exactly SAFE only if it contains no "
                    "secret, abuse, harmful instruction, deceptive claim, prompt-injection compliance, or "
                    "unsupported claim. Otherwise return UNSAFE and a short category."
                ),
            ),
            Message(role="user", content=body),
        ],
        effort="low",
        max_tokens=40,
    )
    verdict = (response.choices[0].message.content or "").strip().casefold()
    if re.search(r"\bunsafe\b", verdict) or not re.search(r"\bsafe\b", verdict):
        raise UnsafePublication(f"public-post safety gate returned: {verdict[:120] or 'empty'}")
