"""Links for people who want to help with Win Dot Panel."""

from __future__ import annotations

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QFrame, QLabel, QPushButton, QVBoxLayout, QWidget

REPOSITORY_URL = "https://github.com/elixpo/packages.elixpo"
DOCUMENTATION_URL = f"{REPOSITORY_URL}/tree/main/apps/win-dot-panel/docs"


class OpenSourcePage(QWidget):
    def __init__(self) -> None:
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 0, 4, 0)
        layout.addStretch()

        card = QFrame()
        card.setObjectName("sourceCard")
        card.setMaximumWidth(420)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(24, 24, 24, 24)
        card_layout.setSpacing(10)

        title = QLabel("Built in the open")
        title.setObjectName("sourceTitle")
        card_layout.addWidget(title)

        description = QLabel("Explore the project, share an idea, or help make it better.")
        description.setObjectName("sourceDescription")
        description.setWordWrap(True)
        card_layout.addWidget(description)
        card_layout.addSpacing(8)

        self.star_button = self._action("☆  Star the repository  ↗", REPOSITORY_URL)
        self.issues_button = self._action("↗  Open issues", f"{REPOSITORY_URL}/issues")
        self.docs_button = self._action("▤  Read the docs", DOCUMENTATION_URL)
        for button in (self.star_button, self.issues_button, self.docs_button):
            card_layout.addWidget(button)

        layout.addWidget(card, alignment=Qt.AlignmentFlag.AlignHCenter)
        layout.addStretch()

    @staticmethod
    def _action(label: str, url: str) -> QPushButton:
        button = QPushButton(label)
        button.setObjectName("sourceAction")
        button.setAccessibleName(label.replace("  ↗", ""))
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(url)))
        return button
