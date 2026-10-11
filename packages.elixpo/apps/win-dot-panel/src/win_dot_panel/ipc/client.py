"""Small synchronous Unix socket client used by the shortcut command."""

from __future__ import annotations

import socket

from win_dot_panel.ipc.protocol import (
    COMMANDS,
    MAX_MESSAGE_BYTES,
    decode_message,
    encode_message,
    socket_path,
)


def send_command(command: str, *, timeout: float = 0.5) -> dict[str, object]:
    if command not in COMMANDS:
        raise ValueError(f"Unknown command: {command}")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(timeout)
        connection.connect(str(socket_path()))
        connection.sendall(encode_message({"command": command}))
        response = bytearray()
        while b"\n" not in response:
            chunk = connection.recv(1024)
            if not chunk:
                raise ConnectionError("Daemon closed the IPC connection")
            response.extend(chunk)
            if len(response) > MAX_MESSAGE_BYTES:
                raise ValueError("IPC response is too large")
    message = decode_message(bytes(response).split(b"\n", 1)[0])
    if not isinstance(message.get("ok"), bool):
        raise TypeError("Malformed IPC response")
    return message
