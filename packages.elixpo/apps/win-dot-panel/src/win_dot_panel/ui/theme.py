"""A neutral, macOS-inspired panel palette."""

from __future__ import annotations

from string import Template

from PySide6.QtGui import QPalette
from PySide6.QtWidgets import QApplication


def is_dark(theme: str) -> bool:
    if theme != "system":
        return theme == "dark"
    app = QApplication.instance()
    return bool(app and app.palette().color(QPalette.ColorRole.Window).lightness() < 128)


def stylesheet(dark: bool) -> str:
    colors = (
        {
            "surface": "#25262b",
            "field": "#34363d",
            "segment": "#303138",
            "selected": "#4a4d57",
            "border": "#555862",
            "text": "#f4f4f6",
            "muted": "#a6a9b2",
            "accent": "#87adff",
            "accent_hover": "#a4c1ff",
            "menu_hover": "#3c3f49",
            "menu_selected": "#405476",
            "button_text": "#20232b",
        }
        if dark
        else {
            "surface": "#fcfcfd",
            "field": "#f0f1f4",
            "segment": "#edeef1",
            "selected": "#ffffff",
            "border": "#d9dce2",
            "text": "#20232b",
            "muted": "#727782",
            "accent": "#336dca",
            "accent_hover": "#285cac",
            "menu_hover": "#f0f2f7",
            "menu_selected": "#e5edfb",
            "button_text": "#ffffff",
        }
    )
    return Template("""
    QFrame#panel {
        background: $surface;
        border: 1px solid $border;
        border-radius: 20px;
    }
    QFrame#dragGrip { background: $border; border: none; border-radius: 2px; }
    QPushButton#closeButton {
        color: $muted;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 18px;
    }
    QPushButton#closeButton:hover { color: $text; background: $field; }
    QPushButton#closeButton:focus { color: $text; border-color: $accent; }
    QFrame#sourceCard {
        background: $field;
        border: 1px solid $border;
        border-radius: 16px;
    }
    QLabel#sourceTitle { color: $text; font-size: 20px; font-weight: 600; }
    QLabel#sourceDescription { color: $muted; font-size: 13px; }
    QPushButton#sourceAction {
        color: $text;
        background: $surface;
        border: 1px solid $border;
        border-radius: 10px;
        padding: 11px 14px;
        font-size: 13px;
        text-align: left;
    }
    QPushButton#sourceAction:hover { border-color: $accent; }
    QPushButton#sourceAction:focus { border-color: $accent; background: $selected; }
    QLabel#subtitle, QLabel#hint, QLabel#emptyCaption { color: $muted; }
    QLabel#emptyTitle { color: $text; font-size: 18px; font-weight: 600; }
    QLabel#emptyIcon { color: $accent; font-size: 38px; }
    QLineEdit#search {
        background: $field;
        color: $text;
        border: 1px solid transparent;
        border-radius: 12px;
        padding: 11px 14px;
        font-size: 14px;
        selection-background-color: $accent;
    }
    QLineEdit#search:focus { border-color: $accent; }
    QFrame#tabBar {
        background: $segment;
        border-radius: 12px;
    }
    QPushButton[tabButton="true"] {
        color: $muted;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 9px;
        padding: 9px 5px;
        font-size: 12px;
        font-weight: 550;
    }
    QPushButton[tabButton="true"]:hover { color: $text; }
    QPushButton[tabButton="true"]:focus { border-color: $accent; }
    QPushButton[tabButton="true"][active="true"] {
        color: $text;
        background: $selected;
        border: 1px solid $border;
    }
    QComboBox#categoryPicker {
        color: $text;
        background: $field;
        border: 1px solid $border;
        border-radius: 11px;
        min-width: 168px;
        padding: 8px 30px 8px 12px;
        font-size: 13px;
    }
    QComboBox#categoryPicker:hover, QComboBox#categoryPicker:focus {
        border-color: $accent;
    }
    QComboBox#categoryPicker::drop-down {
        width: 28px;
        border: none;
    }
    QComboBox#categoryPicker::down-arrow {
        image: none;
        width: 0;
        height: 0;
    }
    QListView#categoryMenu {
        color: $text;
        background: $surface;
        border: 1px solid $border;
        border-radius: 11px;
        padding: 5px;
        outline: none;
        selection-background-color: $menu_selected;
        selection-color: $text;
    }
    QListView#categoryMenu::item {
        min-height: 29px;
        padding: 3px 10px;
        border-radius: 7px;
    }
    QListView#categoryMenu::item:hover {
        background: $menu_hover;
    }
    QListView#categoryMenu::item:selected {
        background: $menu_selected;
        color: $text;
    }
    QMenu {
        background: $surface;
        color: $text;
        border: 1px solid $border;
        border-radius: 10px;
        padding: 5px;
    }
    QMenu::item { padding: 8px 22px; border-radius: 6px; }
    QMenu::item:selected { background: $menu_selected; }
    QPushButton#loadMore {
        color: $text;
        background: $field;
        border: 1px solid $border;
        border-radius: 9px;
        padding: 6px 10px;
    }
    QPushButton#loadMore:hover,
    QPushButton#clipboardMore:hover { background: $menu_hover; }
    QPushButton#loadMore:focus,
    QPushButton#clipboardMore:focus { border-color: $accent; }
    QListView#emojiGrid {
        background: transparent;
        border: none;
        outline: none;
    }
    QListView#emojiGrid QScrollBar:vertical {
        background: transparent;
        width: 8px;
        margin: 2px 0;
    }
    QListView#emojiGrid QScrollBar::handle:vertical {
        background: $border;
        border-radius: 4px;
        min-height: 20px;
    }
    QListView#emojiGrid QScrollBar::add-line:vertical,
    QListView#emojiGrid QScrollBar::sub-line:vertical {
        height: 0;
    }
    QListView#emojiGrid QScrollBar::add-page:vertical,
    QListView#emojiGrid QScrollBar::sub-page:vertical {
        background: transparent;
    }
    QLabel#emojiHeading, QLabel#clipboardHeading, QLabel#textPickerHeading {
        color: $text;
        font-size: 14px;
        font-weight: 600;
    }
    QListView#clipboardList {
        background: transparent;
        border: none;
        outline: none;
    }
    QListView#clipboardList QScrollBar:vertical {
        background: transparent;
        width: 8px;
        margin: 2px 0;
    }
    QListView#clipboardList QScrollBar::handle:vertical {
        background: $border;
        border-radius: 4px;
        min-height: 20px;
    }
    QListView#clipboardList QScrollBar::add-line:vertical,
    QListView#clipboardList QScrollBar::sub-line:vertical {
        height: 0;
    }
    QListView#clipboardList QScrollBar::add-page:vertical,
    QListView#clipboardList QScrollBar::sub-page:vertical {
        background: transparent;
    }
    QListView#textPickerList {
        background: transparent;
        border: none;
        outline: none;
    }
    QListView#textPickerList QScrollBar:vertical {
        background: transparent;
        width: 8px;
        margin: 2px 0;
    }
    QListView#textPickerList QScrollBar::handle:vertical {
        background: $border;
        border-radius: 4px;
        min-height: 20px;
    }
    QListView#textPickerList QScrollBar::add-line:vertical,
    QListView#textPickerList QScrollBar::sub-line:vertical {
        height: 0;
    }
    QListView#textPickerList QScrollBar::add-page:vertical,
    QListView#textPickerList QScrollBar::sub-page:vertical {
        background: transparent;
    }
    QPushButton#clipboardMore {
        background: $field;
        color: $text;
        border: 1px solid $border;
        border-radius: 9px;
        padding: 7px 10px;
    }
    QPushButton#clipboardClear {
        background: transparent;
        color: $muted;
        border: 1px solid transparent;
        padding: 5px 7px;
    }
    QPushButton#clipboardClear:hover { color: $text; }
    QPushButton#clipboardClear:focus { border-color: $accent; }
    """).substitute(colors)
