"""Persistent Wayland keyboard and clipboard access through XDG portals."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from collections.abc import Callable

import gi
from PySide6.QtCore import QObject, QTimer, Signal

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

from win_dot_panel.clipboard.capture import MAX_TEXT_BYTES
from win_dot_panel.clipboard.images import MAX_IMAGE_BYTES

LOGGER = logging.getLogger(__name__)

BUS_NAME = "org.freedesktop.portal.Desktop"
OBJECT_PATH = "/org/freedesktop/portal/desktop"
REMOTE_DESKTOP = "org.freedesktop.portal.RemoteDesktop"
CLIPBOARD = "org.freedesktop.portal.Clipboard"
REQUEST = "org.freedesktop.portal.Request"
SESSION = "org.freedesktop.portal.Session"
HOST_REGISTRY = "org.freedesktop.host.portal.Registry"
KEYBOARD = 1
PERSIST_UNTIL_REVOKED = 2
TEXT_TYPES = ("text/plain;charset=utf-8", "text/plain", "UTF8_STRING")


class WaylandPortalBackend(QObject):
    """Own one portal session for input injection and clipboard monitoring."""

    clipboard_changed = Signal(str, bool)
    image_changed = Signal(bytes, str, bool)
    ready_changed = Signal(bool)
    authorization_failed = Signal(str)
    restore_token_changed = Signal(str)

    def __init__(
        self, restore_token: str = "", connection: Gio.DBusConnection | None = None
    ) -> None:
        super().__init__()
        self.connection = connection or Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.restore_token = restore_token
        self.session_handle: str | None = None
        self.state = "idle"
        self.clipboard_enabled = False
        self._selection_lock = threading.Lock()
        self._owned_selection: dict[str, bytes] = {}
        self._restore_selection: tuple[str, bytes] | None = None
        self._last_external_selection: tuple[str, bytes] | None = None
        self._subscriptions: list[int] = []
        self._glib_context = GLib.MainContext.default()
        self._glib_timer = QTimer(self)
        self._glib_timer.setInterval(20)
        self._glib_timer.timeout.connect(self._dispatch_glib)
        self._glib_timer.start()
        self._register_application()
        self._subscriptions.append(
            self.connection.signal_subscribe(
                BUS_NAME,
                CLIPBOARD,
                "SelectionOwnerChanged",
                OBJECT_PATH,
                None,
                Gio.DBusSignalFlags.NONE,
                self._selection_changed,
            )
        )
        self._subscriptions.append(
            self.connection.signal_subscribe(
                BUS_NAME,
                CLIPBOARD,
                "SelectionTransfer",
                OBJECT_PATH,
                None,
                Gio.DBusSignalFlags.NONE,
                self._selection_transfer,
            )
        )

    @property
    def ready(self) -> bool:
        return self.state == "ready" and self.session_handle is not None

    def start(self) -> bool:
        if self.restore_token:
            QTimer.singleShot(0, self.authorize)
        return True

    def stop(self) -> None:
        self._glib_timer.stop()
        self._close_session()
        for subscription in self._subscriptions:
            self.connection.signal_unsubscribe(subscription)
        self._subscriptions.clear()
        self.session_handle = None
        self.state = "idle"

    def _dispatch_glib(self) -> None:
        """Dispatch portal callbacks while Qt owns the process event loop."""
        while self._glib_context.pending():
            self._glib_context.iteration(False)

    def set_clipboard_data(self, data: bytes, mime_type: str) -> bool:
        """Temporarily publish data through the portal clipboard for insertion."""
        if not self.ready or not self.clipboard_enabled or not data or not mime_type:
            return False
        advertised = (
            {TEXT_TYPES[0]: data, TEXT_TYPES[1]: data}
            if mime_type.startswith("text/")
            else {mime_type: data}
        )
        with self._selection_lock:
            self._restore_selection = self._last_external_selection
            self._owned_selection = advertised
        if self._set_selection(tuple(advertised)):
            return True
        with self._selection_lock:
            self._owned_selection = {}
            self._restore_selection = None
        return False

    def restore_clipboard(self) -> None:
        """Restore the clipboard content observed before temporary insertion."""
        with self._selection_lock:
            restore = self._restore_selection
            self._restore_selection = None
            self._owned_selection = {restore[0]: restore[1]} if restore else {}
        if restore is not None:
            self._set_selection((restore[0],))

    def _set_selection(self, mime_types: tuple[str, ...]) -> bool:
        if self.session_handle is None:
            return False
        try:
            self.connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                CLIPBOARD,
                "SetSelection",
                GLib.Variant(
                    "(oa{sv})",
                    (
                        self.session_handle,
                        {"mime_types": GLib.Variant("as", mime_types)},
                    ),
                ),
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except GLib.Error:
            LOGGER.warning("Could not publish the Wayland clipboard selection", exc_info=True)
            return False
        return True

    def authorize(self) -> None:
        if self.state in {"requesting", "ready"}:
            return
        self.state = "requesting"
        self._close_session()
        session_token = self._token("session")
        self._request(
            REMOTE_DESKTOP,
            "CreateSession",
            "(a{sv})",
            (
                {
                    "session_handle_token": GLib.Variant("s", session_token),
                },
            ),
            self._session_created,
        )

    def send_paste_shortcut(self) -> bool:
        if not self.ready:
            return False
        # Linux input-event keycodes: left shift (42), insert (110).
        events = ((42, 1), (110, 1), (110, 0), (42, 0))
        try:
            for keycode, state in events:
                self.connection.call_sync(
                    BUS_NAME,
                    OBJECT_PATH,
                    REMOTE_DESKTOP,
                    "NotifyKeyboardKeycode",
                    GLib.Variant(
                        "(oa{sv}iu)",
                        (self.session_handle, {}, keycode, state),
                    ),
                    None,
                    Gio.DBusCallFlags.NONE,
                    1000,
                    None,
                )
        except GLib.Error:
            LOGGER.warning("Wayland keyboard insertion failed", exc_info=True)
            return False
        return True

    def _register_application(self) -> None:
        try:
            self.connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                HOST_REGISTRY,
                "Register",
                GLib.Variant("(sa{sv})", ("win-dot-panel", {})),
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except GLib.Error:
            LOGGER.debug("Could not register the host portal application", exc_info=True)

    def _request(
        self,
        interface: str,
        method: str,
        signature: str,
        values: tuple[object, ...],
        callback: Callable[[int, dict[str, object]], None],
    ) -> None:
        token = self._token("request")
        options = dict(values[-1])
        options["handle_token"] = GLib.Variant("s", token)
        parameters = GLib.Variant(signature, (*values[:-1], options))
        sender = self.connection.get_unique_name().removeprefix(":").replace(".", "_")
        expected_path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
        subscription = 0

        def response(
            _connection: Gio.DBusConnection,
            _sender: str,
            _path: str,
            _interface: str,
            _signal: str,
            values: GLib.Variant,
        ) -> None:
            self.connection.signal_unsubscribe(subscription)
            if subscription in self._subscriptions:
                self._subscriptions.remove(subscription)
            code, results = values.unpack()
            callback(code, results)

        subscription = self.connection.signal_subscribe(
            BUS_NAME,
            REQUEST,
            "Response",
            expected_path,
            None,
            Gio.DBusSignalFlags.NONE,
            response,
        )
        self._subscriptions.append(subscription)
        try:
            self.connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                interface,
                method,
                parameters,
                GLib.VariantType.new("(o)"),
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except GLib.Error as error:
            self.connection.signal_unsubscribe(subscription)
            self._subscriptions.remove(subscription)
            self._fail(f"Desktop permission request failed: {error.message}")

    def _session_created(self, code: int, results: dict[str, object]) -> None:
        if code != 0 or not isinstance(results.get("session_handle"), str):
            self._fail("Keyboard control was not enabled")
            return
        self.session_handle = results["session_handle"]
        self._subscriptions.append(
            self.connection.signal_subscribe(
                BUS_NAME,
                SESSION,
                "Closed",
                self.session_handle,
                None,
                Gio.DBusSignalFlags.NONE,
                self._session_closed,
            )
        )
        options: dict[str, GLib.Variant] = {
            "types": GLib.Variant("u", KEYBOARD),
            "persist_mode": GLib.Variant("u", PERSIST_UNTIL_REVOKED),
        }
        if self.restore_token:
            options["restore_token"] = GLib.Variant("s", self.restore_token)
        self._request(
            REMOTE_DESKTOP,
            "SelectDevices",
            "(oa{sv})",
            (self.session_handle, options),
            self._devices_selected,
        )

    def _devices_selected(self, code: int, _results: dict[str, object]) -> None:
        if code != 0 or self.session_handle is None:
            self._fail("Keyboard control was not enabled")
            return
        try:
            self.connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                CLIPBOARD,
                "RequestClipboard",
                GLib.Variant("(oa{sv})", (self.session_handle, {})),
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except GLib.Error:
            LOGGER.warning("Wayland clipboard permission is unavailable", exc_info=True)
        self._request(
            REMOTE_DESKTOP,
            "Start",
            "(osa{sv})",
            (self.session_handle, "", {}),
            self._session_started,
        )

    def _session_started(self, code: int, results: dict[str, object]) -> None:
        devices = results.get("devices", 0)
        if code != 0 or not isinstance(devices, int) or not devices & KEYBOARD:
            self._fail("Keyboard control was not enabled")
            return
        self.clipboard_enabled = bool(results.get("clipboard_enabled", False))
        token = results.get("restore_token")
        if isinstance(token, str) and token:
            self.restore_token = token
            self.restore_token_changed.emit(token)
        self.state = "ready"
        self.ready_changed.emit(True)

    def _fail(self, message: str) -> None:
        self._close_session()
        self.state = "denied"
        self.ready_changed.emit(False)
        self.authorization_failed.emit(message)

    def _selection_changed(
        self,
        _connection: Gio.DBusConnection,
        _sender: str,
        _path: str,
        _interface: str,
        _signal: str,
        values: GLib.Variant,
    ) -> None:
        session_handle, options = values.unpack()
        if (
            not self.ready
            or session_handle != self.session_handle
            or options.get("session_is_owner", False)
        ):
            return
        mime_types = options.get("mime_types", [])
        if not isinstance(mime_types, (list, tuple)):
            return
        mime_type = next((item for item in TEXT_TYPES if item in mime_types), None)
        if mime_type is None:
            mime_type = next(
                (
                    item
                    for item in mime_types
                    if isinstance(item, str) and item.startswith("image/")
                ),
                None,
            )
        if mime_type is None:
            return
        self._read_selection(mime_type)

    def _read_selection(self, mime_type: str) -> None:
        if self.session_handle is None:
            return
        try:
            result, descriptors = self.connection.call_with_unix_fd_list_sync(
                BUS_NAME,
                OBJECT_PATH,
                CLIPBOARD,
                "SelectionRead",
                GLib.Variant("(os)", (self.session_handle, mime_type)),
                GLib.VariantType.new("(h)"),
                Gio.DBusCallFlags.NONE,
                2000,
                None,
                None,
            )
            descriptor = descriptors.get(result.unpack()[0])
        except (GLib.Error, OSError):
            LOGGER.debug("Could not read the Wayland clipboard", exc_info=True)
            return
        threading.Thread(
            target=self._consume_selection, args=(descriptor, mime_type), daemon=True
        ).start()

    def _consume_selection(self, descriptor: int, mime_type: str) -> None:
        image = mime_type.startswith("image/")
        limit = MAX_IMAGE_BYTES if image else MAX_TEXT_BYTES
        chunks = bytearray()
        try:
            while len(chunks) <= limit:
                chunk = os.read(descriptor, min(65536, limit + 1 - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
        except OSError:
            LOGGER.debug("Could not consume Wayland clipboard data", exc_info=True)
            return
        finally:
            os.close(descriptor)
        if not chunks or len(chunks) > limit:
            return
        if image:
            with self._selection_lock:
                self._last_external_selection = (mime_type, bytes(chunks))
            self.image_changed.emit(bytes(chunks), mime_type, False)
            return
        try:
            text = bytes(chunks).decode("utf-8")
        except UnicodeDecodeError:
            return
        with self._selection_lock:
            self._last_external_selection = (mime_type, bytes(chunks))
        self.clipboard_changed.emit(text, False)

    def _selection_transfer(
        self,
        _connection: Gio.DBusConnection,
        _sender: str,
        _path: str,
        _interface: str,
        _signal: str,
        values: GLib.Variant,
    ) -> None:
        session_handle, mime_type, serial = values.unpack()
        if session_handle != self.session_handle:
            return
        with self._selection_lock:
            data = self._owned_selection.get(mime_type)
        if data is None:
            self._selection_write_done(serial, False)
            return
        try:
            result, descriptors = self.connection.call_with_unix_fd_list_sync(
                BUS_NAME,
                OBJECT_PATH,
                CLIPBOARD,
                "SelectionWrite",
                GLib.Variant("(ou)", (self.session_handle, serial)),
                GLib.VariantType.new("(h)"),
                Gio.DBusCallFlags.NONE,
                2000,
                None,
                None,
            )
            descriptor = descriptors.get(result.unpack()[0])
        except (GLib.Error, OSError):
            LOGGER.debug("Could not open the Wayland clipboard transfer", exc_info=True)
            self._selection_write_done(serial, False)
            return
        threading.Thread(
            target=self._write_selection,
            args=(descriptor, serial, data),
            daemon=True,
        ).start()

    def _write_selection(self, descriptor: int, serial: int, data: bytes) -> None:
        success = False
        try:
            view = memoryview(data)
            while view:
                written = os.write(descriptor, view)
                view = view[written:]
            success = True
        except OSError:
            LOGGER.debug("Could not write the Wayland clipboard data", exc_info=True)
        finally:
            os.close(descriptor)
        self._selection_write_done(serial, success)

    def _selection_write_done(self, serial: int, success: bool) -> None:
        if self.session_handle is None:
            return
        try:
            self.connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                CLIPBOARD,
                "SelectionWriteDone",
                GLib.Variant("(oub)", (self.session_handle, serial, success)),
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except GLib.Error:
            LOGGER.debug("Could not finish the Wayland clipboard transfer", exc_info=True)

    def _session_closed(
        self,
        _connection: Gio.DBusConnection,
        _sender: str,
        path: str,
        _interface: str,
        _signal: str,
        _values: GLib.Variant,
    ) -> None:
        if path != self.session_handle:
            return
        self.session_handle = None
        self.clipboard_enabled = False
        self.state = "idle"
        with self._selection_lock:
            self._owned_selection = {}
            self._restore_selection = None
        self.ready_changed.emit(False)

    def _close_session(self) -> None:
        if self.session_handle is None:
            return
        try:
            self.connection.call_sync(
                BUS_NAME,
                self.session_handle,
                SESSION,
                "Close",
                None,
                None,
                Gio.DBusCallFlags.NONE,
                1000,
                None,
            )
        except GLib.Error:
            LOGGER.debug("Could not close the Wayland portal session", exc_info=True)
        self.session_handle = None
        self.clipboard_enabled = False

    @staticmethod
    def _token(prefix: str) -> str:
        return f"{prefix}{uuid.uuid4().hex}"
