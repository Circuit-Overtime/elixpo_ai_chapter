"""Run runner commands through the `rtk` CLI (Rust Token Killer) so build/test
output is token-compressed before it ever enters context — the single biggest
saver for a coding agent. Falls back to a raw run if `rtk` isn't on PATH.
"""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


@dataclass
class CmdResult:
    code: int
    output: str
    compressed: bool  # True if routed through the rtk CLI


def _has_rtk() -> bool:
    return shutil.which("rtk") is not None


_DIRECT_ADAPTERS = {"cargo", "go", "mypy", "npm", "npx", "pnpm", "pytest", "ruff"}
_PYTHON_MODULE_ADAPTERS = {"mypy", "pytest", "ruff"}
_RTK_FAILURE_MARKERS = (
    "failed to create stream fd",
    "failed to spawn process",
    "unknown command",
)


def _rtk_argv(cmd: list[str]) -> list[str]:
    """Select a real RTK adapter, falling back to its generic error filter."""
    executable = Path(cmd[0]).name
    if executable in _DIRECT_ADAPTERS:
        return ["rtk", executable, *cmd[1:]]
    if executable in {"python", "python3"} and len(cmd) >= 3 and cmd[1] == "-m":
        module = cmd[2]
        if module in _PYTHON_MODULE_ADAPTERS:
            return ["rtk", module, *cmd[3:]]
    return ["rtk", "err", *cmd]


def _execute(
    cmd: list[str],
    *,
    cwd: str | None,
    timeout: int,
    env: Mapping[str, str] | None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, timeout=timeout, capture_output=True, text=True, env=env)


def run(
    cmd: list[str],
    cwd: str | None = None,
    timeout: int = 600,
    env: Mapping[str, str] | None = None,
) -> CmdResult:
    """Execute `cmd`. If the rtk CLI exists, prefix it so output is compressed."""
    compressed = _has_rtk()
    full = _rtk_argv(cmd) if compressed else cmd
    proc = _execute(full, cwd=cwd, timeout=timeout, env=env)
    out = (proc.stdout or "") + (proc.stderr or "")
    if compressed and proc.returncode != 0 and any(marker in out.casefold() for marker in _RTK_FAILURE_MARKERS):
        proc = _execute(cmd, cwd=cwd, timeout=timeout, env=env)
        out = (proc.stdout or "") + (proc.stderr or "")
        compressed = False
    return CmdResult(code=proc.returncode, output=out, compressed=compressed)
