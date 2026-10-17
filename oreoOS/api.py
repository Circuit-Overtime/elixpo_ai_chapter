"""Lix OS hardware abstraction layer.

`oreoWare/*` (MicroPython on the ESP32-S3) provides the concrete display/
buttons/IR/LEDs/ADC backend. Apps depend only on this ABC interface — they
don't know or care which backend is wired up, so a future sim re-build can
slot in without touching app code.
"""

try:
    from abc import ABC, abstractmethod
except ImportError:
    # MicroPython has no `abc` module — fall back to duck-typed bases.
    ABC = object
    def abstractmethod(f):
        return f


# ---------- Display geometry ----------
SCREEN_W = 320   # landscape 320×240
SCREEN_H = 240


# ---------- RGB565 colors ----------
def rgb(r, g, b):
    """Pack 8-bit r/g/b into a 16-bit RGB565 word (the panel's native format)."""
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)

BLACK   = 0x0000
WHITE   = 0xFFFF
RED     = 0xF800
GREEN   = 0x07E0
BLUE    = 0x001F
YELLOW  = 0xFFE0
CYAN    = 0x07FF
MAGENTA = 0xF81F
GRAY    = 0x8410


# ---------- Button identifiers ----------
BTN_HOME  = 0
BTN_A     = 1
BTN_B     = 2
BTN_C     = 3
BTN_UP    = 4
BTN_DOWN  = 5
BTN_LEFT  = 6
BTN_RIGHT = 7
BUTTONS = (BTN_HOME, BTN_A, BTN_B, BTN_C, BTN_UP, BTN_DOWN, BTN_LEFT, BTN_RIGHT)


# ---------- Corner LED identifiers ----------
LED_TL = 0
LED_TR = 1
LED_BL = 2
LED_BR = 3


# ---------- Hardware interfaces ----------

class Display(ABC):
    """Immediate-mode 240x320 RGB565 framebuffer. Apps draw, then OS calls present()."""

    @abstractmethod
    def clear(self, color=BLACK): ...

    @abstractmethod
    def pixel(self, x, y, color): ...

    @abstractmethod
    def line(self, x0, y0, x1, y1, color): ...

    @abstractmethod
    def rect(self, x, y, w, h, color, fill=False): ...

    @abstractmethod
    def text(self, s, x, y, color=WHITE, scale=1): ...

    @abstractmethod
    def blit(self, sprite, x, y, w, h):
        """Copy a w*h RGB565 sprite (bytes-like) to (x,y)."""

    def blit_2x(self, sprite, x, y, w, h):
        """Draw an RGB565 sprite at exactly 2× size.

        Hardware backends can override this with a native framebuffer kernel;
        the portable fallback keeps simulator/custom displays functional.
        """
        self.blit_scale(sprite, x, y, w, h, 2)

    def blit_fullscreen(self, sprite):
        """Copy one native 320×240 RGB565 frame into the display."""
        self.blit(sprite, 0, 0, SCREEN_W, SCREEN_H)

    def blit_scale(self, sprite, x, y, w, h, scale, dim=0.0):
        """Draw sprite scaled up by `scale`. dim 0.0–1.0 blends toward theme BG."""
        import struct
        n = w * h
        words = struct.unpack_from(">%dH" % n, sprite, 0)
        if dim > 0:
            from oreoOS import theme as _t
            br, bg_, bb = _t.BG_R, _t.BG_G, _t.BG_B
        for row in range(h):
            for col in range(w):
                word = words[row * w + col]
                r = ((word >> 11) & 0x1F) << 3
                g = ((word >>  5) & 0x3F) << 2
                b = ( word        & 0x1F) << 3
                if dim > 0:
                    r = int(r + (br  - r) * dim)
                    g = int(g + (bg_ - g) * dim)
                    b = int(b + (bb  - b) * dim)
                self.rect(x + col * scale, y + row * scale,
                          scale, scale, rgb(r, g, b), fill=True)

    @abstractmethod
    def present(self):
        """Flush the framebuffer to the panel. The OS calls this — apps don't."""

    def present_rect(self, x, y, w, h):
        """Flush only a rectangle of the framebuffer. Backends may override for speed;
        the default falls back to full-screen present()."""
        self.present()


class Buttons(ABC):
    """8-button input. Both polled and event-driven access supported."""

    @abstractmethod
    def is_pressed(self, btn):
        """Currently held."""

    @abstractmethod
    def just_pressed(self, btn):
        """Pressed since last frame (edge-triggered, cleared on read by OS)."""

    @abstractmethod
    def just_released(self, btn):
        """Released since last frame."""


class IR(ABC):
    """38kHz IR TX/RX, NEC protocol (Tufty-compatible)."""

    @abstractmethod
    def send_nec(self, address, command):
        """Transmit an NEC-encoded packet. Blocks ~67ms."""

    @abstractmethod
    def receive_nec(self):
        """Return (address, command) tuple if a packet is queued, else None."""


class LEDs(ABC):
    """4 corner LEDs (PWM 0-255) + onboard NeoPixel for status."""

    @abstractmethod
    def corner(self, idx, brightness): ...

    @abstractmethod
    def status(self, r, g, b): ...


class ADC(ABC):
    """Analog inputs. Currently just battery voltage via the divider stub."""

    @abstractmethod
    def battery_voltage(self):
        """Return battery voltage in volts (float)."""


class OS(ABC):
    """Services exposed to apps. The launcher constructs one and passes it to each app's on_enter()."""

    display: Display
    buttons: Buttons
    ir:      IR
    leds:    LEDs
    adc:     ADC

    @abstractmethod
    def quit(self):
        """Exit current app, return to launcher."""

    @abstractmethod
    def launch(self, name):
        """Switch to a different app by name."""

    @abstractmethod
    def settings_get(self, key, default=None): ...

    @abstractmethod
    def settings_set(self, key, value): ...
