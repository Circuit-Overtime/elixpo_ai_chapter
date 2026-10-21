"""Minimal ST7789P3 driver for the SmartElex 2.0" 240x320 IPS panel.

Low-level only: reset, init, set address window, push pixel bytes.
Higher-level drawing (framebuf, primitives, text) belongs in oreoWare.display.

Leading-underscore module name signals: not part of the public oreoWare API.
"""

from machine import Pin, SPI
import time

# ----- ST7789 command opcodes -----
_SWRESET = 0x01
_SLPOUT  = 0x11
_NORON   = 0x13
_INVON   = 0x21
_DISPON  = 0x29
_CASET   = 0x2A
_RASET   = 0x2B
_RAMWR   = 0x2C
_MADCTL  = 0x36
_COLMOD  = 0x3A
_PORCTRL = 0xB2     # Porch control (front/back porch lines)
_FRCTRL2 = 0xC6     # Frame rate control in normal mode
_VCOMS   = 0xBB     # VCOM voltage
_LCMCTRL = 0xC0     # LCM control
_VDVVRHEN= 0xC2
_VRHS    = 0xC3
_VDVS    = 0xC4

# MADCTL orientation bits — landscape 320×240
# MX=1 (0x40) | MV=1 (0x20) = 0x60 → 90° CW rotation
_MADCTL_LANDSCAPE = 0x60

# Frame-rate control (FRCTRL2) values per ST7789 datasheet:
#   0x0F = 60Hz (default), 0x14 = 55Hz, 0x18 = 50Hz, 0x1F = 39Hz
# Slower panel scan → bigger vblank window → more time for a 47ms SPI
# write to fit between scans, drastically reducing visible tearing.
_FRAME_RATE = 0x1F   # ~39 Hz


class ST7789:
    def __init__(self, spi, dc, cs, rst, bl, width=240, height=320):
        self.spi = spi
        self.dc, self.cs, self.rst, self.bl = dc, cs, rst, bl
        self.width, self.height = width, height
        self._win = bytearray(4)
        # _RAMWR_BUF cached so present() doesn't allocate every frame.
        self._ramwr_cmd = bytes([_RAMWR])

    # --- low-level: send command (with optional data bytes) ---
    def _cmd(self, c, data=None):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def _hard_reset(self):
        self.rst(1); time.sleep_ms(10)
        self.rst(0); time.sleep_ms(10)
        self.rst(1); time.sleep_ms(120)

    def init(self):
        self._hard_reset()
        self._cmd(_SWRESET); time.sleep_ms(150)
        self._cmd(_SLPOUT);  time.sleep_ms(500)
        self._cmd(_COLMOD, b'\x55')                        # 16bpp RGB565
        self._cmd(_MADCTL, bytes([_MADCTL_LANDSCAPE]))     # landscape 320×240
        # ── Power / timing config to reduce visible refresh artifacts ────
        # PORCTRL: extend front+back porch → larger vblank window for SPI writes
        self._cmd(_PORCTRL,  b'\x0C\x0C\x00\x33\x33')
        self._cmd(_FRCTRL2,  bytes([_FRAME_RATE]))         # slow refresh ~50Hz
        self._cmd(_LCMCTRL,  b'\x2C')
        self._cmd(_VDVVRHEN, b'\x01')
        self._cmd(_VRHS,     b'\x12')
        self._cmd(_VDVS,     b'\x20')
        self._cmd(_VCOMS,    b'\x20')
        # ── Address window: set ONCE — present() reissues RAMWR only ────
        self._cmd(_CASET,  b'\x00\x00\x01\x3F')            # cols 0..319
        self._cmd(_RASET,  b'\x00\x00\x00\xEF')            # rows 0..239
        self._cmd(_INVON);  time.sleep_ms(10)              # IPS needs inversion
        self._cmd(_NORON);  time.sleep_ms(10)
        self._cmd(_DISPON); time.sleep_ms(100)
        # Backlight is NOT turned on here — the Display wrapper pushes a
        # solid black frame first and only then enables BL. That way the
        # user never sees the random LCD-RAM contents that produce a noisy
        # boot flash before the first present().

    def set_window(self, x0, y0, x1, y1):
        w = self._win
        w[0] = x0 >> 8; w[1] = x0 & 0xff
        w[2] = x1 >> 8; w[3] = x1 & 0xff
        self._cmd(_CASET, w)
        w[0] = y0 >> 8; w[1] = y0 & 0xff
        w[2] = y1 >> 8; w[3] = y1 & 0xff
        self._cmd(_RASET, w)

    def fill(self, color565):
        self.set_window(0, 0, self.width - 1, self.height - 1)
        line = bytes([color565 >> 8, color565 & 0xff]) * self.width
        self.cs(0)
        self.dc(0); self.spi.write(bytes([_RAMWR]))
        self.dc(1)
        for _ in range(self.height):
            self.spi.write(line)
        self.cs(1)
