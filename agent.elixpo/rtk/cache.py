"""Caching layer — an OPTIMIZATION store, never the source of truth.

Durable state always lives in GitHub (issues + Project board + state/*.json).
This cache holds only re-derivable, token-expensive artifacts: embedding
vectors (rtk.retrieve), repo/PR summaries (rtk.summarize), and idempotent LLM
responses (safety/classification).

Backend-agnostic and absent-by-default: no env set → in-memory (per-run) cache,
so the system is fully functional with zero infra. When Upstash Redis creds are
present (Phase D), an HTTP-backed cache reachable from BOTH Actions and
Cloudflare takes over for cross-run reuse. Squads never see the backend.

Plus prefix helpers: Pollinations prices a stable repeated prefix at
promptCachedTokens (≈10x cheaper). Keep the preamble fixed and hashable so the
server-side cache hits for free.
"""

from __future__ import annotations

import hashlib
from typing import Protocol, runtime_checkable

from rtk.models import Message

# --- prefix caching (server-side, free) ---

def prefix_hash(messages: list[Message], n: int = 1) -> str:
    """Stable hash of the first `n` messages (the cacheable preamble)."""
    head = messages[:n]
    blob = "".join(f"{m.role}:{m.content or ''}" for m in head)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def split_cacheable(messages: list[Message], n: int = 1) -> tuple[list[Message], list[Message]]:
    """Split into (stable preamble, variable tail) so callers keep the prefix fixed."""
    return messages[:n], messages[n:]


def cache_key(namespace: str, *parts: str) -> str:
    blob = "\x00".join(parts)
    return f"{namespace}:{hashlib.sha256(blob.encode()).hexdigest()[:24]}"


# --- pluggable backend ---

@runtime_checkable
class CacheBackend(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str, ttl: int | None = None) -> None: ...


class NullCache:
    """No-op backend (caching disabled)."""

    def get(self, key: str) -> str | None:
        return None

    def set(self, key: str, value: str, ttl: int | None = None) -> None:
        return None


class MemoryCache:
    """Process-local cache. The default — good for a single run, no infra."""

    def __init__(self) -> None:
        self._d: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._d.get(key)

    def set(self, key: str, value: str, ttl: int | None = None) -> None:
        self._d[key] = value


# Upstash HTTP backend lands in Phase D (rtk.cache_upstash); selected here when
# ELIXPO_UPSTASH_URL / _TOKEN are set. Until then we default to MemoryCache.
def get_cache() -> CacheBackend:
    try:
        from lib.config import settings

        if getattr(settings, "upstash", None) and settings.upstash.url:  # type: ignore[attr-defined]
            from rtk.cache_upstash import UpstashCache  # noqa: F401  (Phase D)

            return UpstashCache(settings.upstash.url, settings.upstash.token)
    except Exception:
        pass
    return MemoryCache()
