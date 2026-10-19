"""Append-only token ledger → state/token_log.jsonl.

One JSON object per model call. Summed into the daily Gist/Discussion later.
The path is injectable so tests write to a tmp file.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rtk.models import Usage


class TokenLedger:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        *,
        task_id: str,
        role: str,
        model: str,
        usage: Usage,
        ts: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        row: dict[str, Any] = {
            "timestamp": ts or datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "role": role,
            "model": model,
            "prompt_tokens": usage.prompt_tokens,
            "cached_tokens": usage.cached_tokens,
            "completion_tokens": usage.completion_tokens,
            "total_tokens": usage.total_tokens,
        }
        if extra:
            row.update(extra)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
        return row
