"""Model-backed emoji browser with search, categories, and recents."""

from __future__ import annotations

import time

from PySide6.QtCore import QAbstractListModel, QModelIndex, QSize, Qt, Signal
from PySide6.QtGui import QColor, QFont, QKeyEvent, QPainter, QResizeEvent
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QListView,
    QPushButton,
    QStyle,
    QStyledItemDelegate,
    QStyleOptionViewItem,
    QVBoxLayout,
    QWidget,
)

from win_dot_panel.emoji.models import EmojiRecord
from win_dot_panel.storage.repositories.emoji_repository import EmojiRepository
from win_dot_panel.ui.widgets.category_combo import CategoryComboBox

PAGE_SIZE = 200
RECENT_SIZE = 8
CELL_SIZE = QSize(52, 52)


class EmojiListModel(QAbstractListModel):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[EmojiRecord] = []

    def rowCount(self, parent: QModelIndex | None = None) -> int:
        return 0 if parent is not None and parent.isValid() else len(self.records)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole) -> object | None:
        if not index.isValid() or not 0 <= index.row() < len(self.records):
            return None
        record = self.records[index.row()]
        if role == Qt.ItemDataRole.DisplayRole:
            return record.emoji
        if role in (Qt.ItemDataRole.ToolTipRole, Qt.ItemDataRole.AccessibleTextRole):
            return record.name
        if role == Qt.ItemDataRole.UserRole:
            return record.id
        return None

    def replace(self, records: list[EmojiRecord]) -> None:
        self.beginResetModel()
        self.records = records
        self.endResetModel()

    def append(self, records: list[EmojiRecord]) -> None:
        if not records:
            return
        start = len(self.records)
        self.beginInsertRows(QModelIndex(), start, start + len(records) - 1)
        self.records.extend(records)
        self.endInsertRows()


class EmojiDelegate(QStyledItemDelegate):
    def __init__(self, dark: bool, parent: QWidget) -> None:
        super().__init__(parent)
        self.dark = dark
        self.cell_size = CELL_SIZE

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hovered = bool(option.state & QStyle.StateFlag.State_MouseOver)
        if selected or hovered:
            color = "#4a4d57" if self.dark else "#e8ecf5"
            painter.setBrush(QColor(color))
            painter.setPen(Qt.PenStyle.NoPen)
            painter.drawRoundedRect(option.rect.adjusted(2, 2, -2, -2), 12, 12)
        font = QFont(option.font)
        font.setPointSize(20)
        painter.setFont(font)
        painter.setPen(QColor("#f4f4f6" if self.dark else "#20232b"))
        painter.drawText(option.rect, Qt.AlignmentFlag.AlignCenter, str(index.data()))
        painter.restore()

    def sizeHint(self, option: QStyleOptionViewItem, index: QModelIndex) -> QSize:
        return self.cell_size


class EmojiGrid(QListView):
    selected = Signal(QModelIndex)

    def resizeEvent(self, event: QResizeEvent) -> None:
        super().resizeEvent(event)
        cell = min(CELL_SIZE.width(), max(40, self.viewport().width() // 8))
        size = QSize(cell, cell)
        if self.gridSize() != size:
            self.setGridSize(size)
            self.itemDelegate().cell_size = size

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.selected.emit(self.currentIndex())
            event.accept()
            return
        super().keyPressEvent(event)


class EmojiPage(QWidget):
    emoji_selected = Signal(str)

    def __init__(self, repository: EmojiRepository, *, dark: bool) -> None:
        super().__init__()
        self.repository = repository
        self.query = ""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self.recent_heading = QLabel("Recent")
        self.recent_heading.setObjectName("emojiHeading")
        layout.addWidget(self.recent_heading)
        self.recent_model = EmojiListModel()
        self.recent_grid = EmojiGrid()
        self.recent_grid.setObjectName("emojiGrid")
        self.recent_grid.setAccessibleName("Recently used emoji")
        self.recent_grid.setModel(self.recent_model)
        self.recent_grid.setItemDelegate(EmojiDelegate(dark, self.recent_grid))
        self.recent_grid.setViewMode(QListView.ViewMode.IconMode)
        self.recent_grid.setFlow(QListView.Flow.LeftToRight)
        self.recent_grid.setWrapping(False)
        self.recent_grid.setMovement(QListView.Movement.Static)
        self.recent_grid.setGridSize(CELL_SIZE)
        self.recent_grid.setUniformItemSizes(True)
        self.recent_grid.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.recent_grid.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.recent_grid.setFixedHeight(CELL_SIZE.height() + 4)
        self.recent_grid.clicked.connect(self.select_recent_index)
        self.recent_grid.selected.connect(self.select_recent_index)
        layout.addWidget(self.recent_grid)

        heading = QHBoxLayout()
        title = QLabel("Browse")
        title.setObjectName("emojiHeading")
        heading.addWidget(title)
        heading.addStretch()
        self.category = CategoryComboBox(dark=dark)
        self.category.setAccessibleName("Emoji category")
        self.category.addItems(["All", "Recent", *repository.list_categories()])
        self.category.currentTextChanged.connect(self.refresh)
        heading.addWidget(self.category)
        layout.addLayout(heading)

        self.model = EmojiListModel()
        self.grid = EmojiGrid()
        self.grid.setObjectName("emojiGrid")
        self.grid.setAccessibleName("Emoji results")
        self.grid.setModel(self.model)
        self.grid.setItemDelegate(EmojiDelegate(dark, self.grid))
        self.grid.setViewMode(QListView.ViewMode.IconMode)
        self.grid.setFlow(QListView.Flow.LeftToRight)
        self.grid.setWrapping(True)
        self.grid.setResizeMode(QListView.ResizeMode.Adjust)
        self.grid.setMovement(QListView.Movement.Static)
        self.grid.setGridSize(CELL_SIZE)
        self.grid.setUniformItemSizes(True)
        self.grid.setVerticalScrollMode(QListView.ScrollMode.ScrollPerPixel)
        self.grid.clicked.connect(self.select_index)
        self.grid.selected.connect(self.select_index)
        layout.addWidget(self.grid, 1)

        self.empty = QLabel("No emoji found")
        self.empty.setObjectName("emptyCaption")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.empty)

        self.more = QPushButton("Load more")
        self.more.setObjectName("loadMore")
        self.more.clicked.connect(self.load_more)
        layout.addWidget(self.more)
        self.refresh()

    def set_dark(self, dark: bool) -> None:
        self.category.set_dark(dark)
        self.grid.itemDelegate().dark = dark
        self.grid.viewport().update()
        self.recent_grid.itemDelegate().dark = dark
        self.recent_grid.viewport().update()

    def set_query(self, text: str) -> None:
        self.query = text.strip()
        self.refresh()

    def refresh(self) -> None:
        recent = self.repository.list_recent(limit=RECENT_SIZE) if not self.query else []
        self.recent_model.replace(recent)
        self.recent_heading.setVisible(bool(recent))
        self.recent_grid.setVisible(bool(recent))
        category = self.category.currentText()
        if self.query:
            filter_category = category if category not in ("All", "Recent") else None
            records = self.repository.search(self.query, category=filter_category, limit=PAGE_SIZE)
        elif category == "Recent":
            records = self.repository.list_recent(limit=PAGE_SIZE)
        elif category == "All":
            records = self.repository.list_all(limit=PAGE_SIZE)
        else:
            records = self.repository.list_category(category, limit=PAGE_SIZE)
        self.model.replace(records)
        self.empty.setVisible(not records)
        self.grid.setVisible(bool(records))
        self.more.setVisible(
            bool(records) and len(records) == PAGE_SIZE and not self.query and category != "Recent"
        )
        if records:
            self.grid.setCurrentIndex(self.model.index(0, 0))

    def load_more(self) -> None:
        category = self.category.currentText()
        offset = len(self.model.records)
        if category == "All":
            records = self.repository.list_all(limit=PAGE_SIZE, offset=offset)
        else:
            records = self.repository.list_category(category, limit=PAGE_SIZE, offset=offset)
        self.model.append(records)
        self.more.setVisible(len(records) == PAGE_SIZE)

    def select_current_or_first(self) -> None:
        index = self.grid.currentIndex()
        if not index.isValid() and self.model.records:
            index = self.model.index(0, 0)
        self.select_index(index)

    def select_index(self, index: QModelIndex) -> None:
        if not index.isValid():
            return
        self._select_record(self.model.records[index.row()])

    def select_recent_index(self, index: QModelIndex) -> None:
        if index.isValid():
            self._select_record(self.recent_model.records[index.row()])

    def _select_record(self, record: EmojiRecord) -> None:
        self.repository.record_usage(record.id, timestamp=time.time_ns())
        self.refresh()
        self.emoji_selected.emit(record.emoji)
