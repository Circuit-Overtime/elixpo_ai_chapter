"""Shared rounded category selector."""

from __future__ import annotations

from PySide6.QtCore import QPoint
from PySide6.QtGui import QColor, QPainter, QPaintEvent, QPen
from PySide6.QtWidgets import QComboBox, QListView


class CategoryComboBox(QComboBox):
    def __init__(self, *, dark: bool) -> None:
        super().__init__()
        self.dark = dark
        self.setObjectName("categoryPicker")
        menu = QListView()
        menu.setObjectName("categoryMenu")
        menu.setUniformItemSizes(True)
        menu.setSpacing(2)
        self.setView(menu)

    def set_dark(self, dark: bool) -> None:
        self.dark = dark
        self.update()

    def paintEvent(self, event: QPaintEvent) -> None:
        super().paintEvent(event)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(QPen(QColor("#b7bac4" if self.dark else "#6e7582"), 1.8))
        center_x = self.width() - 18
        center_y = self.height() // 2
        painter.drawLine(QPoint(center_x - 4, center_y - 2), QPoint(center_x, center_y + 2))
        painter.drawLine(QPoint(center_x, center_y + 2), QPoint(center_x + 4, center_y - 2))
