"""oreoOS — the Python OS layer for the Oreo conference badge.

Apps subclass `oreoOS.App` and import services from this package:

    import oreoOS
    from oreoOS import api, theme, widgets

    class App(oreoOS.App):
        def on_enter(self, os): ...
"""

from .api import (
    SCREEN_W, SCREEN_H,
    rgb, BLACK, WHITE, RED, GREEN, BLUE, YELLOW, CYAN, MAGENTA, GRAY,
    BTN_HOME, BTN_A, BTN_B, BTN_C, BTN_UP, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BUTTONS,
    LED_TL, LED_TR, LED_BL, LED_BR,
    Display, Buttons, IR, LEDs, ADC, OS,
)
from .app import App
from . import font
from .sprite import SpriteSheet, Animation
from .launcher import boot
