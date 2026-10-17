"""Offline kaomoji and symbol browsers."""

from __future__ import annotations

from math import ceil

from PySide6.QtCore import (
    QAbstractListModel,
    QEvent,
    QModelIndex,
    QObject,
    QRect,
    QSize,
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import QColor, QFont, QFontMetrics, QKeyEvent, QPainter
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QListView,
    QStyle,
    QStyledItemDelegate,
    QStyleOptionViewItem,
    QVBoxLayout,
    QWidget,
)

from win_dot_panel.text_picker.data import KAOMOJI, KAOMOJI_CATEGORIES, SYMBOLS, TextItem
from win_dot_panel.ui.widgets.category_combo import CategoryComboBox

PAGE_SIZE = 240


class TextItemModel(QAbstractListModel):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[TextItem] = []

    def rowCount(self, parent: QModelIndex | None = None) -> int:
        return 0 if parent is not None and parent.isValid() else len(self.records)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole) -> object | None:
        if not index.isValid() or not 0 <= index.row() < len(self.records):
            return None
        item = self.records[index.row()]
        if role == Qt.ItemDataRole.DisplayRole:
            return item.value
        if role in (Qt.ItemDataRole.ToolTipRole, Qt.ItemDataRole.AccessibleTextRole):
            return item.name
        return None

    def replace(self, records: list[TextItem]) -> None:
        self.beginResetModel()
        self.records = records
        self.endResetModel()

    def append(self, records: list[TextItem]) -> None:
        if not records:
            return
        start = len(self.records)
        self.beginInsertRows(QModelIndex(), start, start + len(records) - 1)
        self.records.extend(records)
        self.endInsertRows()


class PickerView(QListView):
    selected = Signal(QModelIndex)

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.selected.emit(self.currentIndex())
            event.accept()
            return
        super().keyPressEvent(event)


class SymbolDelegate(QStyledItemDelegate):
    def __init__(self, *, dark: bool, parent: QWidget) -> None:
        super().__init__(parent)
        self.dark = dark

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hovered = bool(option.state & QStyle.StateFlag.State_MouseOver)
        if selected or hovered:
            painter.setBrush(QColor("#4a4d57" if self.dark else "#e8ecf5"))
            painter.setPen(Qt.PenStyle.NoPen)
            painter.drawRoundedRect(option.rect.adjusted(2, 2, -2, -2), 11, 11)
        font = QFont(option.font)
        font.setPointSize(23)
        painter.setFont(font)
        painter.setPen(QColor("#f4f4f6" if self.dark else "#20232b"))
        painter.drawText(option.rect, Qt.AlignmentFlag.AlignCenter, str(index.data()))
        painter.restore()

    def sizeHint(self, option: QStyleOptionViewItem, index: QModelIndex) -> QSize:
        return QSize(56, 58)


class KaomojiDelegate(QStyledItemDelegate):
    def __init__(self, *, dark: bool, parent: QWidget) -> None:
        super().__init__(parent)
        self.dark = dark
        self.widths: list[int] = []

    @staticmethod
    def preferred_width(item: TextItem, font: QFont, available: int) -> int:
        value_font = QFont(font)
        value_font.setPointSize(15)
        value_width = QFontMetrics(value_font).horizontalAdvance(item.value)
        name_width = QFontMetrics(font).horizontalAdvance(item.name)
        return min(max(116, value_width + 30, name_width + 28), min(420, available))

    def paint(self, painter: QPainter, option: QStyleOptionViewItem, index: QModelIndex) -> None:
        item: TextItem = index.model().records[index.row()]
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hovered = bool(option.state & QStyle.StateFlag.State_MouseOver)
        if selected:
            background = "#405476" if self.dark else "#e5edfb"
        elif hovered:
            background = "#3c3f49" if self.dark else "#f0f2f7"
        else:
            background = "#34363d" if self.dark else "#f5f6f8"
        card = option.rect.adjusted(2, 2, -2, -2)
        painter.setBrush(QColor(background))
        painter.setPen(QColor("#555862" if self.dark else "#e1e3e8"))
        painter.drawRoundedRect(card, 10, 10)
        left = card.left() + 12
        width = card.width() - 24
        font = QFont(option.font)
        font.setPointSize(15)
        painter.setFont(font)
        painter.setPen(QColor("#f4f4f6" if self.dark else "#20232b"))
        painter.drawText(
            QRect(left, card.top() + 5, width, card.height() - 29),
            Qt.AlignmentFlag.AlignCenter | Qt.TextFlag.TextWrapAnywhere,
            item.value,
        )
        painter.setFont(option.font)
        painter.setPen(QColor("#a6a9b2" if self.dark else "#727782"))
        painter.drawText(QRect(left, card.bottom() - 21, width, 17), item.name)
        painter.restore()

    def sizeHint(self, option: QStyleOptionViewItem, index: QModelIndex) -> QSize:
        item: TextItem = index.model().records[index.row()]
        font = QFont(option.font)
        font.setPointSize(15)
        value_width = QFontMetrics(font).horizontalAdvance(item.value)
        available = max(120, self.parent().viewport().width() - 12)
        width = (
            self.widths[index.row()]
            if index.row() < len(self.widths)
            else self.preferred_width(item, option.font, available)
        )
        lines = ceil(value_width / max(1, width - 28))
        return QSize(width, 60 + (lines - 1) * 25)


def justified_kaomoji_widths(
    records: list[TextItem], viewport_width: int, font: QFont, spacing: int
) -> list[int]:
    """Fill each wrapping row while retaining each card's relative width."""
    # QListView wraps a row whose total reaches the viewport edge exactly.
    available = max(120, viewport_width - 2 * spacing - 1)
    widths: list[int] = []
    row: list[int] = []

    def flush() -> None:
        if not row:
            return
        free = available - sum(row) - spacing * (len(row) - 1)
        weight = sum(row)
        stretched = [width + free * width // weight for width in row]
        stretched[-1] += available - sum(stretched) - spacing * (len(row) - 1)
        widths.extend(stretched)
        row.clear()

    for item in records:
        width = KaomojiDelegate.preferred_width(item, font, available)
        if row and sum(row) + width + spacing * len(row) > available:
            flush()
        row.append(width)
    flush()
    return widths


class TextPickerPage(QWidget):
    text_selected = Signal(str)

    def __init__(self, kind: str, *, dark: bool) -> None:
        super().__init__()
        if kind not in ("Kaomoji", "Symbols"):
            raise ValueError(f"Unsupported text picker: {kind}")
        self.kind = kind
        self.items = KAOMOJI if kind == "Kaomoji" else SYMBOLS
        self.query = ""
        self._matches: list[TextItem] = []
        self._layout_pending = False
        self._layout_width = -1
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        heading = QHBoxLayout()
        label = QLabel("Browse")
        label.setObjectName("textPickerHeading")
        heading.addWidget(label)
        heading.addStretch()
        self.category = CategoryComboBox(dark=dark)
        self.category.setAccessibleName(f"{kind} category")
        categories = (
            KAOMOJI_CATEGORIES
            if kind == "Kaomoji"
            else tuple(dict.fromkeys(item.category for item in self.items))
        )
        self.category.addItems(["All", *categories])
        self.category.currentTextChanged.connect(self.refresh)
        heading.addWidget(self.category)
        layout.addLayout(heading)

        self.model = TextItemModel()
        self.view = PickerView()
        self.view.setObjectName("textPickerList")
        self.view.setAccessibleName(f"{kind} results")
        self.view.setModel(self.model)
        self.view.setVerticalScrollMode(QListView.ScrollMode.ScrollPerPixel)
        if kind == "Symbols":
            self.view.setItemDelegate(SymbolDelegate(dark=dark, parent=self.view))
            self.view.setViewMode(QListView.ViewMode.IconMode)
            self.view.setFlow(QListView.Flow.LeftToRight)
            self.view.setWrapping(True)
            self.view.setResizeMode(QListView.ResizeMode.Adjust)
            self.view.setMovement(QListView.Movement.Static)
            self.view.setGridSize(QSize(56, 58))
            self.view.setUniformItemSizes(True)
        else:
            self.kaomoji_delegate = KaomojiDelegate(dark=dark, parent=self.view)
            self.view.setItemDelegate(self.kaomoji_delegate)
            self.view.setViewMode(QListView.ViewMode.IconMode)
            self.view.setFlow(QListView.Flow.LeftToRight)
            self.view.setWrapping(True)
            self.view.setResizeMode(QListView.ResizeMode.Adjust)
            self.view.setMovement(QListView.Movement.Static)
            self.view.setSpacing(6)
            self.view.setUniformItemSizes(False)
            self.view.viewport().installEventFilter(self)
        self.view.clicked.connect(self.select_index)
        self.view.selected.connect(self.select_index)
        self.view.verticalScrollBar().valueChanged.connect(self._maybe_load_more)
        layout.addWidget(self.view, 1)

        self.empty = QLabel(f"No {kind.lower()} found")
        self.empty.setObjectName("emptyCaption")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.empty)
        self.refresh()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:
        if (
            self.kind == "Kaomoji"
            and watched is self.view.viewport()
            and event.type() == QEvent.Type.Resize
        ):
            self._schedule_kaomoji_layout()
        return super().eventFilter(watched, event)

    def _schedule_kaomoji_layout(self) -> None:
        if self.kind == "Kaomoji" and not self._layout_pending:
            self._layout_pending = True
            QTimer.singleShot(0, self._layout_kaomoji)

    def _layout_kaomoji(self) -> None:
        self._layout_pending = False
        width = self.view.viewport().width()
        if width == self._layout_width and len(self.kaomoji_delegate.widths) == len(
            self.model.records
        ):
            return
        self._layout_width = width
        self.kaomoji_delegate.widths = justified_kaomoji_widths(
            self.model.records, width, self.view.font(), self.view.spacing()
        )
        self.view.doItemsLayout()

    def set_dark(self, dark: bool) -> None:
        self.category.set_dark(dark)
        self.view.itemDelegate().dark = dark
        self.view.viewport().update()

    def set_query(self, text: str) -> None:
        self.query = text.strip().casefold()
        self.refresh()

    def refresh(self) -> None:
        category = self.category.currentText()
        terms = self.query.split()
        self._matches = [
            item
            for item in self.items
            if (category == "All" or item.category == category)
            and all(
                term in f"{item.value} {item.name} {item.keywords}".casefold() for term in terms
            )
        ]
        self.model.replace(self._matches[:PAGE_SIZE])
        if self.kind == "Kaomoji":
            self._layout_width = -1
            self._schedule_kaomoji_layout()
        self.view.setVisible(bool(self._matches))
        self.empty.setVisible(not self._matches)
        if self._matches:
            self.view.setCurrentIndex(self.model.index(0, 0))

    def _maybe_load_more(self, value: int) -> None:
        bar = self.view.verticalScrollBar()
        if value >= bar.maximum() - bar.pageStep() and len(self.model.records) < len(self._matches):
            start = len(self.model.records)
            self.model.append(self._matches[start : start + PAGE_SIZE])

    def select_current_or_first(self) -> None:
        index = self.view.currentIndex()
        if not index.isValid() and self.model.records:
            index = self.model.index(0, 0)
        self.select_index(index)

    def select_index(self, index: QModelIndex) -> None:
        if index.isValid():
            self.text_selected.emit(self.model.records[index.row()].value)
