"""Line-delimited JSON messages for local CLI requests."""

from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path

COMMANDS = frozenset(
    {"enable-wayland", "toggle", "toggle-clipboard", "show", "hide", "status", "quit"}
)
MAX_MESSAGE_BYTES = 4096
MAX_CLIPBOARD_EVENT_BYTES = 16 * 1024 * 1024 * 4 // 3 + 2048


def runtime_dir() -> Path:
    configured = os.environ.get("XDG_RUNTIME_DIR")
    path = (
        Path(configured)
        if configured
        else Path(tempfile.gettempdir()) / f"win-dot-panel-{os.getuid()}"
    )
    if not configured:
        path.mkdir(mode=0o700, exist_ok=True)
    details = path.stat()
    if details.st_uid != os.getuid() or stat.S_IMODE(details.st_mode) & 0o077:
        raise PermissionError(f"Insecure runtime directory: {path}")
    return path


def socket_path() -> Path:
    return runtime_dir() / "win-dot-panel.sock"


def lock_path() -> Path:
    return runtime_dir() / "win-dot-panel.lock"


def encode_message(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")


def decode_message(data: bytes, *, max_bytes: int = MAX_MESSAGE_BYTES) -> dict[str, object]:
    if len(data) > max_bytes:
        raise ValueError("IPC message is too large")
    payload = json.loads(data)
    if not isinstance(payload, dict):
        raise TypeError("IPC message must be a JSON object")
    return payload
