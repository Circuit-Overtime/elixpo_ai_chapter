"""Reusable floating panel shell."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from typing import Protocol

from PySide6.QtCore import (
    QEasingCurve,
    QEvent,
    QEventLoop,
    QMimeData,
    QObject,
    QPoint,
    QPropertyAnimation,
    QRect,
    QSize,
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import (
    QClipboard,
    QColor,
    QCursor,
    QKeyEvent,
    QKeySequence,
    QMouseEvent,
    QPalette,
    QShortcut,
)
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QGraphicsDropShadowEffect,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from win_dot_panel.clipboard.models import ClipboardItem
from win_dot_panel.config import TABS, Settings
from win_dot_panel.insertion import TextInserter
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository
from win_dot_panel.storage.repositories.emoji_repository import EmojiRepository
from win_dot_panel.ui.pages.clipboard_page import ClipboardPage
from win_dot_panel.ui.pages.emoji_page import EmojiPage
from win_dot_panel.ui.pages.open_source_page import OpenSourcePage
from win_dot_panel.ui.pages.text_picker_page import TextPickerPage
from win_dot_panel.ui.theme import is_dark, stylesheet

LOGGER = logging.getLogger(__name__)


class InputController(Protocol):
    ready: bool
    state: str
    ready_changed: Signal
    authorization_failed: Signal

    def authorize(self) -> None: ...

    def set_clipboard_data(self, data: bytes, mime_type: str) -> bool: ...

    def restore_clipboard(self) -> None: ...

    def send_paste_shortcut(self) -> bool: ...


PAGE_TEXT = {
    "Emoji": ("☺", "Find the right emoji", "Search or browse your favorite expressions."),
    "Clipboard": ("▤", "Your clipboard, close at hand", "Recent copied text will appear here."),
    "Kaomoji": ("( ˶ˆᗜˆ˵ )", "A little more expression", "Kaomoji will appear here."),
    "Symbols": ("✦", "Every symbol in one place", "Search for arrows, marks, and more."),
}


def position_near_cursor(cursor: QPoint, size: QSize, area: QRect) -> QPoint:
    """Place the popup beside the pointer and keep it within the usable screen."""
    gap = 16
    x = cursor.x() + gap
    y = cursor.y() + gap
    if x + size.width() > area.right() + 1:
        x = cursor.x() - size.width() - gap
    if y + size.height() > area.bottom() + 1:
        y = cursor.y() - size.height() - gap
    x = max(area.left(), min(x, area.right() + 1 - size.width()))
    y = max(area.top(), min(y, area.bottom() + 1 - size.height()))
    return QPoint(x, y)


class PopupPanel(QWidget):
    panel_hidden = Signal()

    def __init__(
        self,
        settings: Settings,
        emoji_repository: EmojiRepository | None = None,
        clipboard_repository: ClipboardRepository | None = None,
        input_controller: InputController | None = None,
    ) -> None:
        super().__init__()
        self.settings = settings
        self.input_controller = input_controller
        self.inserter = TextInserter()
        self._dark = is_dark(settings.theme)
        self._drag_offset: QPoint | None = None
        self._suppress_deactivation = False
        self._clipboard_restore_data: QMimeData | None = None
        self._clipboard_signals_blocked = False
        self._paste_generation = 0
        self._reopen_after_paste = False
        self._portal_paste_active = False
        self._paste_snapshot: QLabel | None = None
        self.setWindowTitle("Win Dot Panel")
        self.setWindowFlags(
            Qt.WindowType.Tool
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMinimumSize(480, 480)
        self.resize(540, 560)
        self.setStyleSheet(stylesheet(self._dark))

        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 16, 16, 16)
        panel = QFrame()
        panel.setObjectName("panel")
        outer.addWidget(panel)

        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(30)
        shadow.setOffset(0, 10)
        shadow.setColor(QColor(0, 0, 0, 65))
        panel.setGraphicsEffect(shadow)

        content = QVBoxLayout(panel)
        content.setContentsMargins(24, 14, 24, 18)
        content.setSpacing(16)

        self.drag_handle = QFrame()
        self.drag_handle.setFixedHeight(26)
        self.drag_handle.setAccessibleName("Drag panel")
        self.drag_handle.setCursor(Qt.CursorShape.OpenHandCursor)
        drag_layout = QHBoxLayout(self.drag_handle)
        drag_layout.setContentsMargins(0, 0, 0, 0)
        balance = QWidget()
        balance.setFixedWidth(26)
        balance.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        grip = QFrame()
        grip.setObjectName("dragGrip")
        grip.setFixedSize(32, 4)
        grip.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.close_button = QPushButton("×")
        self.close_button.setObjectName("closeButton")
        self.close_button.setFixedSize(26, 26)
        self.close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_button.setAccessibleName("Close panel")
        self.close_button.setToolTip("Close")
        self.close_button.clicked.connect(self.hide_panel)
        drag_layout.addWidget(balance)
        drag_layout.addStretch()
        drag_layout.addWidget(grip, alignment=Qt.AlignmentFlag.AlignCenter)
        drag_layout.addStretch()
        drag_layout.addWidget(self.close_button)
        content.addWidget(self.drag_handle)

        self.search = QLineEdit()
        self.search.setObjectName("search")
        self.search.setClearButtonEnabled(True)
        self.search.setAccessibleName("Search current tab")
        self.search.installEventFilter(self)
        self.drag_handle.installEventFilter(self)
        content.addWidget(self.search)

        tab_bar = QFrame()
        tab_bar.setObjectName("tabBar")
        tabs_layout = QHBoxLayout(tab_bar)
        tabs_layout.setContentsMargins(4, 4, 4, 4)
        tabs_layout.setSpacing(3)
        self.tab_buttons: list[QPushButton] = []
        for index, name in enumerate(TABS):
            button = QPushButton(name)
            button.setProperty("tabButton", True)
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            button.setAccessibleName(f"{name} tab")
            button.clicked.connect(lambda checked=False, tab=index: self.select_tab(tab))
            tabs_layout.addWidget(button, 1)
            self.tab_buttons.append(button)
        content.addWidget(tab_bar)

        self.pages = QStackedWidget()
        self.emoji_page = (
            EmojiPage(emoji_repository, dark=self._dark) if emoji_repository is not None else None
        )
        self.clipboard_page = (
            ClipboardPage(clipboard_repository, dark=self._dark)
            if clipboard_repository is not None
            else None
        )
        self.kaomoji_page = TextPickerPage("Kaomoji", dark=self._dark)
        self.symbols_page = TextPickerPage("Symbols", dark=self._dark)
        self.source_page = OpenSourcePage()
        for name in TABS:
            if name == "Emoji" and self.emoji_page is not None:
                page = self.emoji_page
            elif name == "Clipboard" and self.clipboard_page is not None:
                page = self.clipboard_page
            elif name == "Kaomoji":
                page = self.kaomoji_page
            elif name == "Symbols":
                page = self.symbols_page
            elif name == "Open Source":
                page = self.source_page
            else:
                page = self._empty_page(name)
            self.pages.addWidget(page)
        content.addWidget(self.pages, 1)

        self.search.textChanged.connect(self._search_changed)
        self.search.returnPressed.connect(self._select_search_result)
        if self.emoji_page is not None:
            self.emoji_page.emoji_selected.connect(self._insert_text)
        if self.clipboard_page is not None:
            self.clipboard_page.activated.connect(self._insert_clipboard_item)
        self.kaomoji_page.text_selected.connect(self._insert_text)
        self.symbols_page.text_selected.connect(self._insert_text)

        self.hint = QLabel("Ctrl+Tab  Switch tab     Esc  Close")
        self.hint.setObjectName("hint")
        self.hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content.addWidget(self.hint)
        hint_opacity = QGraphicsOpacityEffect(self.hint)
        self.hint.setGraphicsEffect(hint_opacity)
        self.hint_animation = QPropertyAnimation(hint_opacity, b"opacity", self)
        self.hint_animation.setDuration(180)
        self.hint_animation.setEasingCurve(QEasingCurve.Type.OutCubic)

        next_tab = QShortcut(QKeySequence("Ctrl+Tab"), self)
        next_tab.activated.connect(
            lambda: self.select_tab((self.pages.currentIndex() + 1) % len(TABS))
        )
        previous_tab = QShortcut(QKeySequence("Ctrl+Shift+Tab"), self)
        previous_tab.activated.connect(
            lambda: self.select_tab((self.pages.currentIndex() - 1) % len(TABS))
        )
        close = QShortcut(QKeySequence("Escape"), self)
        close.activated.connect(self.hide_panel)

        self.select_tab(TABS.index(settings.last_tab), persist=False)
        if settings.theme == "system":
            QApplication.instance().paletteChanged.connect(self._refresh_theme)
        if self.input_controller is not None:
            self.input_controller.ready_changed.connect(self._portal_ready_changed)
            self.input_controller.authorization_failed.connect(self._portal_failed)

    def _portal_ready_changed(self, ready: bool) -> None:
        if ready and self.isVisible():
            self.hint.setText("Keyboard and clipboard access enabled")

    def _portal_failed(self, message: str) -> None:
        if self.isVisible():
            self.hint.setText(f"{message} — reopen the panel to try again")

    def _refresh_theme(self, _palette: QPalette) -> None:
        dark = is_dark(self.settings.theme)
        if dark == self._dark:
            return
        self._dark = dark
        self.setStyleSheet(stylesheet(dark))
        if self.emoji_page is not None:
            self.emoji_page.set_dark(dark)
        if self.clipboard_page is not None:
            self.clipboard_page.set_dark(dark)
        self.kaomoji_page.set_dark(dark)
        self.symbols_page.set_dark(dark)

    def _empty_page(self, name: str) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(8)
        icon, heading, caption = PAGE_TEXT[name]
        for text, object_name in (
            (icon, "emptyIcon"),
            (heading, "emptyTitle"),
            (caption, "emptyCaption"),
        ):
            label = QLabel(text)
            label.setObjectName(object_name)
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            layout.addWidget(label)
        return page

    def select_tab(self, index: int, *, persist: bool = True) -> None:
        self.pages.setCurrentIndex(index)
        name = TABS[index]
        self.search.setPlaceholderText(f"Search {name.lower()}…")
        self.search.clear()
        self.search.setVisible(name != "Open Source")
        if name == "Clipboard" and self.clipboard_page is not None:
            self.clipboard_page.refresh()
        for tab_index, button in enumerate(self.tab_buttons):
            button.setProperty("active", tab_index == index)
            button.style().unpolish(button)
            button.style().polish(button)
        if persist and self.settings.last_tab != name:
            self.settings.last_tab = name
            try:
                self.settings.save()
            except OSError as error:
                LOGGER.warning("Could not save settings: %s", error)
        self._focus_current_page()

    def _focus_current_page(self) -> None:
        if self.pages.currentIndex() == TABS.index("Open Source"):
            self.source_page.star_button.setFocus()
        else:
            self.search.setFocus()

    def show_panel(self) -> None:
        if not self.isVisible():
            if self.input_controller is None:
                self.inserter.capture_focused_field()
            else:
                # Portal input is delivered to whichever app regains focus after hide.
                # Avoid a blocking xdotool lookup that cannot identify native Wayland windows.
                self.inserter.tracking_enabled = False
            cursor = QCursor.pos()
            screen = QApplication.screenAt(cursor) or QApplication.primaryScreen()
            if screen is not None:
                self.move(position_near_cursor(cursor, self.size(), screen.availableGeometry()))
        self.hint_animation.stop()
        self.hint.graphicsEffect().setOpacity(1.0)
        if self.input_controller is not None and not self.input_controller.ready:
            self.input_controller.authorize()
            self.hint.setText("Approve keyboard and clipboard access for Wayland insertion")
        else:
            self.hint.setText("Ctrl+Tab  Switch tab     Esc  Close")
        if self.emoji_page is not None and self.pages.currentIndex() == 0:
            self.emoji_page.refresh()
        if self.clipboard_page is not None and self.pages.currentIndex() == 1:
            self.clipboard_page.refresh()
        self.show()
        self.raise_()
        self.activateWindow()
        QTimer.singleShot(0, self._focus_current_page)

    def hide_panel(self) -> None:
        if self.isVisible():
            self.inserter.resume_focus_tracking()
            self.hide()
            self.panel_hidden.emit()

    def event(self, event: QEvent) -> bool:
        if event.type() == QEvent.Type.WindowDeactivate and self.isVisible():
            QTimer.singleShot(0, self._hide_after_deactivation)
        return super().event(event)

    def _hide_after_deactivation(self) -> None:
        if (
            not self._suppress_deactivation
            and self.isVisible()
            and QApplication.activePopupWidget() is None
        ):
            self.hide_panel()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:
        if watched is self.drag_handle and isinstance(event, QMouseEvent):
            if (
                event.type() == QEvent.Type.MouseButtonPress
                and event.button() == Qt.MouseButton.LeftButton
            ):
                self.drag_handle.setCursor(Qt.CursorShape.ClosedHandCursor)
                window = self.windowHandle()
                if window is None or not window.startSystemMove():
                    self._drag_offset = event.globalPosition().toPoint() - self.pos()
                event.accept()
                return True
            if event.type() == QEvent.Type.MouseMove and self._drag_offset is not None:
                self.move(event.globalPosition().toPoint() - self._drag_offset)
                event.accept()
                return True
            if (
                event.type() == QEvent.Type.MouseButtonRelease
                and event.button() == Qt.MouseButton.LeftButton
            ):
                self._drag_offset = None
                self.drag_handle.setCursor(Qt.CursorShape.OpenHandCursor)
                event.accept()
                return True
        if (
            watched is self.search
            and isinstance(event, QKeyEvent)
            and event.type() == QEvent.Type.KeyPress
            and event.key() in (Qt.Key.Key_Down, Qt.Key.Key_Up)
        ):
            view = None
            page = self.pages.currentWidget()
            if isinstance(page, EmojiPage) and page.model.records:
                view = page.grid
            elif isinstance(page, ClipboardPage) and page.model.records:
                view = page.list
            elif isinstance(page, TextPickerPage) and page.model.records:
                view = page.view
            if view is not None:
                view.setCurrentIndex(view.model().index(0, 0))
                view.setFocus()
                return True
        return super().eventFilter(watched, event)

    def _search_changed(self, text: str) -> None:
        if self.pages.currentIndex() == 0 and self.emoji_page is not None:
            self.emoji_page.set_query(text)
        elif self.pages.currentIndex() == 1 and self.clipboard_page is not None:
            self.clipboard_page.set_query(text)
        elif self.pages.currentIndex() == 2:
            self.kaomoji_page.set_query(text)
        elif self.pages.currentIndex() == 3:
            self.symbols_page.set_query(text)

    def _select_search_result(self) -> None:
        if self.pages.currentIndex() == 0 and self.emoji_page is not None:
            self.emoji_page.select_current_or_first()
        elif self.pages.currentIndex() == 1 and self.clipboard_page is not None:
            self.clipboard_page.select_current_or_first()
        elif self.pages.currentIndex() == 2:
            self.kaomoji_page.select_current_or_first()
        elif self.pages.currentIndex() == 3:
            self.symbols_page.select_current_or_first()

    def _insert_text(self, value: str, *, keep_open: bool = True) -> bool:
        inserted = self.inserter.insert(value) or self._insert_with_clipboard_paste(
            value, keep_open=keep_open
        )
        if inserted:
            self.hint.setText("Inserted at the previous cursor position")
        elif self.input_controller is not None and not self.input_controller.ready:
            self.input_controller.authorize()
            self.hint.setText("Approve keyboard control, then select the item again")
        else:
            self.hint.setText("Could not insert here — focus an editable text field and reopen")
        self.hint_animation.stop()
        self.hint_animation.setStartValue(0.35)
        self.hint_animation.setEndValue(1.0)
        self.hint_animation.start()
        return inserted

    @staticmethod
    def _system_clipboard() -> QClipboard:
        return QApplication.clipboard()

    @staticmethod
    def _copy_mime_data(source: QMimeData) -> QMimeData:
        copy = QMimeData()
        for mime_type in source.formats():
            copy.setData(mime_type, source.data(mime_type))
        return copy

    def _insert_with_clipboard_paste(self, value: str, *, keep_open: bool) -> bool:
        window_id = self.inserter.target_window
        portal = self.input_controller
        if portal is None and window_id is None:
            return False
        if portal is not None and not portal.ready:
            portal.authorize()
            return False
        if portal is not None:
            return self._insert_with_portal_clipboard(
                value.encode("utf-8"),
                "text/plain;charset=utf-8",
                keep_open=keep_open,
            )
        clipboard = self._system_clipboard()
        if self._clipboard_restore_data is None:
            self._clipboard_restore_data = self._copy_mime_data(clipboard.mimeData())
            self._clipboard_signals_blocked = clipboard.signalsBlocked()
            clipboard.blockSignals(True)
        clipboard.setText(value, QClipboard.Mode.Clipboard)
        self._paste_generation += 1
        generation = self._paste_generation
        self._suppress_deactivation = True
        self._reopen_after_paste = keep_open
        commands = (
            ["xdotool", "windowactivate", "--sync", window_id],
            [
                "xdotool",
                "key",
                "--window",
                window_id,
                "--clearmodifiers",
                "shift+Insert",
            ],
        )
        try:
            for command in commands:
                result = subprocess.run(
                    command,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=1,
                    check=False,
                )
                if result.returncode != 0:
                    self._finish_clipboard_paste(generation)
                    return False
        except (OSError, subprocess.TimeoutExpired):
            self._finish_clipboard_paste(generation)
            return False
        QTimer.singleShot(250, lambda: self._finish_clipboard_paste(generation))
        return True

    def _insert_with_portal_clipboard(
        self, data: bytes, mime_type: str, *, keep_open: bool
    ) -> bool:
        portal = self.input_controller
        if portal is None or not portal.set_clipboard_data(data, mime_type):
            return False
        self._paste_generation += 1
        generation = self._paste_generation
        self._portal_paste_active = True
        self._suppress_deactivation = True
        self._reopen_after_paste = keep_open
        if keep_open:
            self._show_paste_snapshot()
        self.hide()
        QTimer.singleShot(120, lambda: self._send_portal_paste(generation))
        return True

    def _show_paste_snapshot(self) -> None:
        """Keep the panel visually stable while its real window releases focus."""
        self._hide_paste_snapshot()
        snapshot = QLabel()
        snapshot.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        snapshot.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        snapshot.setWindowFlags(
            Qt.WindowType.ToolTip
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.WindowDoesNotAcceptFocus
            | Qt.WindowType.WindowTransparentForInput
            | Qt.WindowType.X11BypassWindowManagerHint
        )
        snapshot.setPixmap(self.grab())
        snapshot.setGeometry(self.geometry())
        snapshot.show()
        snapshot.raise_()
        QApplication.processEvents(QEventLoop.ProcessEventsFlag.ExcludeUserInputEvents)
        self._paste_snapshot = snapshot

    def _hide_paste_snapshot(self) -> None:
        snapshot = self._paste_snapshot
        if snapshot is None:
            return
        self._paste_snapshot = None
        snapshot.hide()
        snapshot.deleteLater()

    def _send_portal_paste(self, generation: int) -> None:
        if generation != self._paste_generation:
            return
        portal = self.input_controller
        if portal is None or not portal.send_paste_shortcut():
            self._finish_clipboard_paste(generation)
            self.hint.setText("Wayland keyboard control is unavailable")
            return
        QTimer.singleShot(250, lambda: self._finish_clipboard_paste(generation))

    def _finish_clipboard_paste(self, generation: int) -> None:
        if generation != self._paste_generation:
            return
        if self._portal_paste_active and self.input_controller is not None:
            self.input_controller.restore_clipboard()
            self._portal_paste_active = False
        else:
            clipboard = self._system_clipboard()
            if self._clipboard_restore_data is not None:
                clipboard.setMimeData(self._clipboard_restore_data, QClipboard.Mode.Clipboard)
                self._clipboard_restore_data = None
            clipboard.blockSignals(self._clipboard_signals_blocked)
        self._suppress_deactivation = False
        if self._reopen_after_paste:
            self.show()
            self.raise_()
            self.activateWindow()
            self._hide_paste_snapshot()
            QTimer.singleShot(0, self._focus_current_page)
        elif not self.isVisible():
            self._hide_paste_snapshot()
            self.inserter.resume_focus_tracking()
            self.panel_hidden.emit()
        self._reopen_after_paste = False

    def _insert_clipboard_item(self, item: ClipboardItem) -> None:
        if item.content_type == "text":
            if self._insert_text(item.text_content, keep_open=False):
                self.hide_panel()
            return
        if not item.image_content:
            self.hint.setText("This image is unavailable")
            return
        portal = self.input_controller
        if portal is not None:
            if not portal.ready:
                portal.authorize()
                self.hint.setText("Approve keyboard control, then select the item again")
                return
            if self._insert_with_portal_clipboard(
                item.image_content,
                "image/png",
                keep_open=False,
            ):
                self.hint.setText("Inserted at the previous cursor position")
            else:
                self.hint.setText("Wayland clipboard access is unavailable")
            return
        wayland = os.environ.get("XDG_SESSION_TYPE") == "wayland"
        command = (
            ["ydotool", "key", "29:1", "47:1", "47:0", "29:0"]
            if wayland
            else ["xdotool", "key", "--clearmodifiers", "ctrl+v"]
        )
        if shutil.which(command[0]) is None:
            self.hint.setText(f"Image insertion needs {command[0]} on this desktop")
            return
        from PySide6.QtGui import QImage

        image = QImage.fromData(item.image_content, "PNG")
        if image.isNull():
            self.hint.setText("This image could not be loaded")
            return
        QApplication.clipboard().setImage(image)
        self.hide_panel()
        QTimer.singleShot(120, lambda: self._paste_image(command))

    @staticmethod
    def _paste_image(command: list[str]) -> None:
        try:
            subprocess.Popen(command, stdin=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            LOGGER.warning("Could not send paste shortcut", exc_info=True)
