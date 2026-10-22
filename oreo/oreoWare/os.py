"""OS implementation for the hardware backend.

Holds singletons for every peripheral, mediates app-↔-launcher communication
(quit / launch requests), and stores ephemeral settings. Persistent settings
will land here once we have NVS / filesystem-backed storage.
"""

from oreoOS import api
from oreoWare.display import Display
from oreoWare.buttons import Buttons


class OS(api.OS):
    def __init__(self):
        self.display = Display()
        self.buttons = Buttons()
        # backends added incrementally — wired up as each peripheral comes online
        self.leds = None
        self.ir   = None
        self.adc  = None

        self._quit_requested = False
        self._launch_request = None
        self._settings = {}

    def quit(self):
        self._quit_requested = True

    def launch(self, name):
        self._launch_request = name
        self._quit_requested = True

    def settings_get(self, key, default=None):
        return self._settings.get(key, default)

    def settings_set(self, key, value):
        self._settings[key] = value
