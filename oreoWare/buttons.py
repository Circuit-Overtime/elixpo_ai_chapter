"""Buttons backend — implements oreoOS.api.Buttons via INPUT_PULLUP GPIOs.

Edge detection (just_pressed / just_released) works against the *previous* frame,
so update() must be called exactly once per frame by the OS loop. Apps don't
call update() themselves — they receive a Buttons instance that's already up to
date.
"""

import time

from machine import Pin

from oreoOS import api
from oreoWare import pins


_BTN_TO_GPIO = {
    api.BTN_HOME:  pins.BTN_HOME,
    api.BTN_A:     pins.BTN_A,
    api.BTN_B:     pins.BTN_B,
    api.BTN_C:     pins.BTN_C,
    api.BTN_UP:    pins.BTN_UP,
    api.BTN_DOWN:  pins.BTN_DOWN,
    api.BTN_LEFT:  pins.BTN_LEFT,
    api.BTN_RIGHT: pins.BTN_RIGHT,
}

# Breadboard tactile switches typically bounce for 2-6 ms. Eight
# milliseconds removes duplicate edges without making a press feel delayed.
DEBOUNCE_MS = 8


class Buttons(api.Buttons):
    def __init__(self):
        self._pins = {b: Pin(g, Pin.IN, Pin.PULL_UP) for b, g in _BTN_TO_GPIO.items()}
        self._button_index = {b: i for i, b in enumerate(api.BUTTONS)}
        self._irq_pending = bytearray(len(api.BUTTONS))
        self._irq_release_pending = bytearray(len(api.BUTTONS))
        self._pressed_edges = bytearray(len(api.BUTTONS))
        self._released_edges = bytearray(len(api.BUTTONS))
        self._last_edge_ms = [0] * len(api.BUTTONS)
        self._irq_handlers = []
        self._curr = {b: 1 for b in _BTN_TO_GPIO}
        self._prev = {b: 1 for b in _BTN_TO_GPIO}
        # Press-timestamp tracking — used by the run loop to synthesize
        # long-press auto-repeat events for navigation buttons (so any
        # scrollable list "just works" with a held UP/DOWN). None means
        # the button is up; an int = time.ticks_ms() at press edge.
        self._press_ms = {b: None for b in _BTN_TO_GPIO}

        # Latch falling edges even while native video inflate/LCD transfer is
        # running. The ISR only flips a preallocated byte; app callbacks and
        # allocations remain in the normal OS loop where they are safe.
        for b, p in self._pins.items():
            idx = self._button_index[b]
            pending = self._irq_pending
            releases = self._irq_release_pending
            def _edge(_pin, _idx=idx, _pending=pending,
                      _releases=releases):
                if _pin.value() == 0:
                    _pending[_idx] = 1
                else:
                    _releases[_idx] = 1
            self._irq_handlers.append(_edge)
            try:
                p.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=_edge)
            except Exception:
                pass

    def update(self):
        now = time.ticks_ms()
        for b, p in self._pins.items():
            idx = self._button_index[b]
            latched = self._irq_pending[idx]
            self._irq_pending[idx] = 0
            released = self._irq_release_pending[idx]
            self._irq_release_pending[idx] = 0
            v = p.value()
            self._prev[b] = self._curr[b]
            self._pressed_edges[idx] = 0
            self._released_edges[idx] = 0

            elapsed = time.ticks_diff(now, self._last_edge_ms[idx])
            # IRQ latching preserves taps that occur during a display flush.
            # Polling the current level is the fallback when IRQ is absent.
            wants_press = bool(latched) or (v == 0 and self._curr[b] == 1)
            wants_release = (bool(released) or
                             (v == 1 and self._curr[b] == 0))

            if (wants_press and self._curr[b] == 1 and
                    elapsed >= DEBOUNCE_MS):
                self._curr[b] = 0
                self._pressed_edges[idx] = 1
                self._last_edge_ms[idx] = now
                self._press_ms[b] = now
            elif (wants_release and self._curr[b] == 0 and
                  elapsed >= DEBOUNCE_MS):
                self._curr[b] = 1
                self._released_edges[idx] = 1
                self._last_edge_ms[idx] = now
                self._press_ms[b] = None

    def is_pressed(self, btn):
        return self._curr[btn] == 0

    def just_pressed(self, btn):
        return bool(self._pressed_edges[self._button_index[btn]])

    def just_released(self, btn):
        return bool(self._released_edges[self._button_index[btn]])

    def pressed_for_ms(self, btn):
        """Milliseconds the button has been held, or 0 if currently up.

        Read by the OS run loop to fire auto-repeat events on navigation
        buttons. Cheap to call every frame — pure arithmetic on the
        cached press timestamp.
        """
        t = self._press_ms.get(btn)
        if t is None:
            return 0
        return time.ticks_diff(time.ticks_ms(), t)
