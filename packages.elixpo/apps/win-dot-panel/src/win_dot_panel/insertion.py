"""Insert text through accessibility or a retained desktop window."""

from __future__ import annotations

import logging
import shutil
import subprocess

LOGGER = logging.getLogger(__name__)


class TextInserter:
    def __init__(self) -> None:
        self.target = None
        self.caret_offset: int | None = None
        self.target_window: str | None = None
        self.tracking_enabled = True
        self.listener = None
        try:
            import gi

            gi.require_version("Atspi", "2.0")
            from gi.repository import Atspi
        except (ImportError, ValueError):
            self.atspi = None
        else:
            self.atspi = Atspi
            try:
                self.listener = Atspi.EventListener.new(self._focused_changed)
                self.listener.register("object:state-changed:focused")
            except Exception:
                self.listener = None
                LOGGER.debug("Could not register the accessibility focus listener", exc_info=True)

    def capture_focused_field(self) -> None:
        """Freeze the last focus event and retain the active window before showing."""
        self.target_window = self._capture_active_window()
        self.tracking_enabled = False

    def resume_focus_tracking(self) -> None:
        self.tracking_enabled = True

    def _focused_changed(self, event: object, *_user_data: object) -> None:
        if not self.tracking_enabled or not getattr(event, "detail1", 0):
            return
        self._remember_focused_field(getattr(event, "source", None))

    def _remember_focused_field(self, node: object | None) -> None:
        self.target = None
        self.caret_offset = None
        if node is None or self.atspi is None:
            return
        try:
            if not node.is_editable_text() or node.get_role() == self.atspi.Role.PASSWORD_TEXT:
                return
            text = node.get_text_iface()
            editable = node.get_editable_text_iface()
            if text is None or editable is None:
                return
            offset = text.get_caret_offset()
            if offset >= 0:
                self.target = node
                self.caret_offset = offset
        except Exception:
            LOGGER.debug("Could not retain the focused text field", exc_info=True)

    @staticmethod
    def _capture_active_window() -> str | None:
        if shutil.which("xdotool") is None:
            return None
        try:
            result = subprocess.run(
                ["xdotool", "getactivewindow"],
                capture_output=True,
                text=True,
                timeout=1,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        window_id = result.stdout.strip()
        return window_id if result.returncode == 0 and window_id.isdigit() else None

    def insert(self, value: str) -> bool:
        if self.target is None or self.caret_offset is None:
            return False
        try:
            text = self.target.get_text_iface()
            editable = self.target.get_editable_text_iface()
            if text is None or editable is None:
                return False
            offset = self.caret_offset
            if not editable.insert_text(offset, value, len(value.encode("utf-8"))):
                return False
            self.caret_offset = offset + len(value)
            text.set_caret_offset(self.caret_offset)
            return True
        except Exception:
            LOGGER.debug("Could not insert into the focused text field", exc_info=True)
            return False
