"""Paged clipboard history with direct activation and per-card actions."""

from __future__ import annotations

from PySide6.QtCore import QAbstractListModel, QModelIndex, QPoint, QRect, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QKeyEvent, QMouseEvent, QPainter, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QListView,
    QMenu,
    QPushButton,
    QStyle,
    QStyledItemDelegate,
    QStyleOptionViewItem,
    QVBoxLayout,
    QWidget,
)

from win_dot_panel.clipboard.models import ClipboardPreview
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository

PAGE_SIZE = 30


class ClipboardListModel(QAbstractListModel):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[ClipboardPreview] = []

    def rowCount(self, parent: QModelIndex | None = None) -> int:
        return 0 if parent is not None and parent.isValid() else len(self.records)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole) -> object | None:
        if not index.isValid() or not 0 <= index.row() < len(self.records):
            return None
        record = self.records[index.row()]
        description = "Screenshot" if record.content_type == "image" else record.preview
        if role == Qt.ItemDataRole.DisplayRole:
            return description
        if role == Qt.ItemDataRole.AccessibleTextRole:
            label = "Pinned clipboard item" if record.is_pinned else "Clipboard item"
            return f"{label}: {description}"
        if role == Qt.ItemDataRole.ToolTipRole:
            return description
        if role == Qt.ItemDataRole.UserRole:
            return record.id
        return None

    def replace(self, records: list[ClipboardPreview]) -> None:
        self.beginResetModel()
        self.records = records
        self.endResetModel()

    def append(self, records: list[ClipboardPreview]) -> None:
        if not records:
            return
        start = len(self.records)
        self.beginInsertRows(QModelIndex(), start, start + len(records) - 1)
        self.records.extend(records)
        self.endInsertRows()


class ClipboardCardDelegate(QStyledItemDelegate):
    def __init__(self, *, dark: bool, parent: QWidget) -> None:
        super().__init__(parent)
        self.dark = dark

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        record: ClipboardPreview = index.model().records[index.row()]
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hovered = bool(option.state & QStyle.StateFlag.State_MouseOver)
        if selected:
            fill = "#405476" if self.dark else "#e5edfb"
        else:
            fill = "#34363d" if self.dark else "#f5f6f8"
        if hovered and not selected:
            fill = "#3c3f49" if self.dark else "#f0f2f7"
        painter.setBrush(QColor(fill))
        painter.setPen(QColor("#555862" if self.dark else "#e1e3e8"))
        card = option.rect.adjusted(2, 2, -2, -2)
        painter.drawRoundedRect(card, 11, 11)

        left = card.left() + 14
        width = card.width() - 28
        if record.content_type == "image" and record.thumbnail_content:
            thumbnail = QPixmap()
            if thumbnail.loadFromData(record.thumbnail_content, "PNG"):
                preview_box = QRect(left, card.top() + 6, 54, 54)
                painter.drawPixmap(
                    preview_box,
                    thumbnail,
                    thumbnail.rect(),
                )
                left += 64
                width -= 64
        text = (
            ["Screenshot", "Image copied to clipboard"]
            if record.content_type == "image"
            else record.preview.replace("\t", "    ").splitlines()
        )
        title = text[0] if text else ""
        font = QFont(option.font)
        font.setWeight(QFont.Weight.Medium)
        painter.setFont(font)
        painter.setPen(QColor("#f4f4f6" if self.dark else "#20232b"))
        metrics = painter.fontMetrics()
        available = width - (88 if record.is_pinned else 30)
        painter.drawText(
            QRect(left, card.top() + 12, available, 22),
            Qt.AlignmentFlag.AlignVCenter,
            metrics.elidedText(title, Qt.TextElideMode.ElideRight, available),
        )

        painter.setFont(option.font)
        painter.setPen(QColor("#a6a9b2" if self.dark else "#727782"))
        detail = text[1] if len(text) > 1 else f"{record.char_count} characters"
        if record.char_count > len(record.preview) and len(text) > 1:
            detail += "…"
        painter.drawText(
            QRect(left, card.top() + 39, width, 20),
            Qt.AlignmentFlag.AlignVCenter,
            painter.fontMetrics().elidedText(detail, Qt.TextElideMode.ElideRight, width),
        )
        if record.is_pinned:
            painter.setPen(QColor("#87adff" if self.dark else "#336dca"))
            painter.drawText(
                QRect(card.right() - 71, card.top() + 11, 57, 22),
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
                "Pinned",
            )
        painter.setPen(QColor("#a6a9b2" if self.dark else "#727782"))
        painter.drawText(
            QRect(card.right() - 35, card.top() + 22, 24, 24),
            Qt.AlignmentFlag.AlignCenter,
            "⋯",
        )
        painter.restore()

    def sizeHint(self, option: QStyleOptionViewItem, index: QModelIndex) -> QSize:
        return QSize(100, 72)


class ClipboardList(QListView):
    activate_requested = Signal()
    menu_requested = Signal(QModelIndex, QPoint)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        index = self.indexAt(event.position().toPoint())
        if index.isValid() and event.button() == Qt.MouseButton.LeftButton:
            rect = self.visualRect(index)
            if event.position().toPoint().x() >= rect.right() - 43:
                self.setCurrentIndex(index)
                self.menu_requested.emit(index, event.globalPosition().toPoint())
                event.accept()
                return
        super().mousePressEvent(event)

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.activate_requested.emit()
            event.accept()
            return
        super().keyPressEvent(event)


class ClipboardPage(QWidget):
    activated = Signal(object)

    def __init__(self, repository: ClipboardRepository, *, dark: bool) -> None:
        super().__init__()
        self.repository = repository
        self.query = ""
        self.has_more = False
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        heading = QHBoxLayout()
        title = QLabel("History")
        title.setObjectName("clipboardHeading")
        heading.addWidget(title)
        heading.addStretch()
        self.clear_button = QPushButton("Clear unpinned")
        self.clear_button.setObjectName("clipboardClear")
        self.clear_button.clicked.connect(self.confirm_clear)
        self.clear_timer = QTimer(self)
        self.clear_timer.setSingleShot(True)
        self.clear_timer.timeout.connect(self._reset_clear)
        self._clear_armed = False
        heading.addWidget(self.clear_button)
        layout.addLayout(heading)

        self.model = ClipboardListModel()
        self.list = ClipboardList()
        self.list.setObjectName("clipboardList")
        self.list.setAccessibleName("Clipboard history")
        self.list.setModel(self.model)
        self.list.setItemDelegate(ClipboardCardDelegate(dark=dark, parent=self.list))
        self.list.setSpacing(5)
        self.list.setUniformItemSizes(True)
        self.list.setVerticalScrollMode(QListView.ScrollMode.ScrollPerPixel)
        self.list.clicked.connect(self.activate_index)
        self.list.activate_requested.connect(self.activate_current)
        self.list.menu_requested.connect(self.show_item_menu)
        self.list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.list.customContextMenuRequested.connect(self._context_menu)
        layout.addWidget(self.list, 1)

        self.empty = QLabel("No clipboard history yet")
        self.empty.setObjectName("emptyCaption")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.empty)

        self.more = QPushButton("Load more")
        self.more.setObjectName("clipboardMore")
        self.more.clicked.connect(self.load_more)
        layout.addWidget(self.more)
        self.refresh()

    def set_dark(self, dark: bool) -> None:
        self.list.itemDelegate().dark = dark
        self.list.viewport().update()

    def set_query(self, text: str) -> None:
        self.query = text.strip()
        self.refresh()

    def refresh(self, *, select_id: int | None = None) -> None:
        records = self.repository.list_previews(query=self.query, limit=PAGE_SIZE + 1)
        self.has_more = len(records) > PAGE_SIZE
        self.model.replace(records[:PAGE_SIZE])
        self._update_view()
        if select_id is not None:
            for row, record in enumerate(self.model.records):
                if record.id == select_id:
                    self.list.setCurrentIndex(self.model.index(row, 0))
                    return
        if self.model.records:
            self.list.setCurrentIndex(self.model.index(0, 0))

    def load_more(self) -> None:
        offset = len(self.model.records)
        records = self.repository.list_previews(
            query=self.query, limit=PAGE_SIZE + 1, offset=offset
        )
        self.has_more = len(records) > PAGE_SIZE
        self.model.append(records[:PAGE_SIZE])
        self._update_view()

    def _update_view(self) -> None:
        has_items = bool(self.model.records)
        self.list.setVisible(has_items)
        self.empty.setText("No matches" if self.query else "No clipboard history yet")
        self.empty.setVisible(not has_items)
        self.more.setVisible(self.has_more)

    def _current(self) -> ClipboardPreview | None:
        index = self.list.currentIndex()
        if not index.isValid() or index.row() >= len(self.model.records):
            return None
        return self.model.records[index.row()]

    def select_current_or_first(self) -> None:
        if self._current() is None and self.model.records:
            self.list.setCurrentIndex(self.model.index(0, 0))
        self.activate_current()

    def activate_index(self, index: QModelIndex) -> None:
        if index.isValid():
            self.list.setCurrentIndex(index)
            self.activate_current()

    def activate_current(self) -> None:
        record = self._current()
        if record is None:
            return
        item = self.repository.get(record.id)
        if item is None:
            self.refresh()
        else:
            self.activated.emit(item)

    def _context_menu(self, position: QPoint) -> None:
        index = self.list.indexAt(position)
        if index.isValid():
            self.show_item_menu(index, self.list.viewport().mapToGlobal(position))

    def show_item_menu(self, index: QModelIndex, global_position: QPoint) -> None:
        if not index.isValid():
            return
        record = self.model.records[index.row()]
        item_id = record.id
        menu = QMenu(self)
        copy_action = menu.addAction("Copy to clipboard")
        pin_action = menu.addAction("Unpin" if record.is_pinned else "Pin")
        delete_action = menu.addAction("Remove")
        copy_action.triggered.connect(lambda: self.copy_item(item_id))
        pin_action.triggered.connect(lambda: self._set_pinned(item_id, not record.is_pinned))
        delete_action.triggered.connect(lambda: self._delete_item(item_id))
        menu.aboutToHide.connect(menu.deleteLater)
        self._item_menu = menu
        menu.popup(global_position)

    def _set_pinned(self, item_id: int, pinned: bool) -> None:
        if self.repository.set_pinned(item_id, pinned):
            self.refresh(select_id=item_id)

    def _delete_item(self, item_id: int) -> None:
        if self.repository.delete(item_id):
            self.refresh()

    def copy_current(self, _index: QModelIndex | None = None) -> None:
        record = self._current()
        if record is not None:
            self.copy_item(record.id)

    def copy_item(self, item_id: int) -> None:
        item = self.repository.get(item_id)
        if item is None:
            self.refresh()
            return
        if item.content_type == "image":
            from PySide6.QtGui import QImage

            image = QImage.fromData(item.image_content or b"", "PNG")
            if image.isNull():
                return
            QApplication.clipboard().setImage(image)
        else:
            QApplication.clipboard().setText(item.text_content)

    def toggle_pin(self) -> None:
        record = self._current()
        if record is not None and self.repository.set_pinned(record.id, not record.is_pinned):
            self.refresh(select_id=record.id)

    def delete_current(self) -> None:
        record = self._current()
        if record is not None and self.repository.delete(record.id):
            self.refresh()

    def confirm_clear(self) -> None:
        if not self._clear_armed:
            self._clear_armed = True
            self.clear_button.setText("Confirm clear")
            self.clear_timer.start(4000)
            return
        self.repository.clear()
        self._reset_clear()
        self.refresh()

    def _reset_clear(self) -> None:
        self._clear_armed = False
        self.clear_timer.stop()
        self.clear_button.setText("Clear unpinned")
