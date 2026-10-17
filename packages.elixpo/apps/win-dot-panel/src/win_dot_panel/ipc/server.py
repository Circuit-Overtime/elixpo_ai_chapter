"""Qt event-loop Unix socket server."""

from __future__ import annotations

import logging
from collections.abc import Callable

from PySide6.QtCore import QObject
from PySide6.QtNetwork import QLocalServer, QLocalSocket

from win_dot_panel.ipc.protocol import (
    MAX_CLIPBOARD_EVENT_BYTES,
    MAX_MESSAGE_BYTES,
    decode_message,
    encode_message,
    socket_path,
)

LOGGER = logging.getLogger(__name__)


class IpcServer(QObject):
    def __init__(
        self,
        handler: Callable[[str], dict[str, object]],
        event_handler: Callable[[dict[str, object]], dict[str, object]] | None = None,
    ) -> None:
        super().__init__()
        self.handler = handler
        self.event_handler = event_handler
        self.server = QLocalServer(self)
        self.server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self.server.newConnection.connect(self._accept)
        self._buffers: dict[QLocalSocket, bytearray] = {}

    def start(self) -> None:
        path = socket_path()
        QLocalServer.removeServer(str(path))
        if not self.server.listen(str(path)):
            raise OSError(f"Could not start IPC server: {self.server.errorString()}")

    def stop(self) -> None:
        self.server.close()
        socket_path().unlink(missing_ok=True)

    def _accept(self) -> None:
        while self.server.hasPendingConnections():
            connection = self.server.nextPendingConnection()
            self._buffers[connection] = bytearray()
            connection.readyRead.connect(lambda client=connection: self._read(client))
            connection.disconnected.connect(lambda client=connection: self._drop(client))

    def _read(self, connection: QLocalSocket) -> None:
        buffer = self._buffers.get(connection)
        if buffer is None:
            return
        buffer.extend(bytes(connection.readAll()))
        if len(buffer) > MAX_CLIPBOARD_EVENT_BYTES:
            self._reply(connection, {"ok": False, "error": "Request too large"})
            return
        if b"\n" not in buffer:
            return
        try:
            request = decode_message(
                bytes(buffer).split(b"\n", 1)[0], max_bytes=MAX_CLIPBOARD_EVENT_BYTES
            )
            command = request.get("command")
            if not isinstance(command, str):
                raise TypeError("Missing command")
            if command == "clipboard_event":
                if self.event_handler is None:
                    raise ValueError("Clipboard event handler is unavailable")
                response = self.event_handler(request)
            elif len(buffer) > MAX_MESSAGE_BYTES:
                raise ValueError("Request too large")
            else:
                response = self.handler(command)
        except (TypeError, ValueError) as error:
            response = {"ok": False, "error": str(error)}
        except Exception:
            LOGGER.exception("IPC command failed")
            response = {"ok": False, "error": "Internal daemon error"}
        self._reply(connection, response)

    def _reply(self, connection: QLocalSocket, response: dict[str, object]) -> None:
        connection.write(encode_message(response))
        connection.flush()
        connection.disconnectFromServer()

    def _drop(self, connection: QLocalSocket) -> None:
        self._buffers.pop(connection, None)
        connection.deleteLater()
