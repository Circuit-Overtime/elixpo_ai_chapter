"""Display backend — implements oreoOS.api.Display on the badge.

Framebuffer strategy:
  - Full 320×240×2 = 153 KB RGB565 framebuffer in PSRAM
  - All drawing goes through MicroPython framebuf primitives
  - present() pushes the buffer to ST7789 over SPI — but ONLY when the
    framebuffer was actually modified (dirty flag), preventing idle flicker.

Byte-order:
  framebuf stores RGB565 little-endian; ST7789 expects big-endian over SPI.
  _swap() pre-swaps colors as they enter framebuf so present() can dump
  the buffer verbatim without per-pixel conversion at flush time.
"""

import framebuf
import struct
from machine import Pin, SPI
from time import sleep_us as utime_sleep_us

from oreoOS import api
from oreoWare import pins
from oreoWare._st7789 import ST7789


def _swap(c):
    return ((c & 0xFF) << 8) | ((c >> 8) & 0xFF)


# Chroma-key: sprite pixels equal to this 16-bit value are treated as transparent.
# Optimizer fills cleared pixels with RGB565 magenta 0xF81F, packed big-endian as
# bytes [0xF8, 0x1F]. framebuf.RGB565 interprets these bytes as little-endian uint16
# → (0x1F << 8) | 0xF8 = 0x1FF8. So we pass that to framebuf.blit's `key` arg.
CHROMA_KEY = 0x1FF8


def _scale2_kernel(src, dst, x, y, w, h, stride):
    """Pure-Python fallback; replaced by Viper on the badge."""
    for sy in range(h):
        src_row = sy * w * 2
        dst_row0 = ((y + sy * 2) * stride + x) * 2
        dst_row1 = dst_row0 + stride * 2
        for sx in range(w):
            so = src_row + sx * 2
            do = dst_row0 + sx * 4
            b0, b1 = src[so], src[so + 1]
            dst[do] = b0
            dst[do + 1] = b1
            dst[do + 2] = b0
            dst[do + 3] = b1
            do += dst_row1 - dst_row0
            dst[do] = b0
            dst[do + 1] = b1
            dst[do + 2] = b0
            dst[do + 3] = b1


_SCALE2_VIPER_SRC = """
@micropython.viper
def _scale2_kernel(src: ptr8, dst: ptr8, x: int, y: int,
                   w: int, h: int, stride: int):
    sy = 0
    while sy < h:
        src_row = sy * w * 2
        dst0 = ((y + sy * 2) * stride + x) * 2
        dst1 = dst0 + stride * 2
        sx = 0
        while sx < w:
            so = src_row + sx * 2
            do0 = dst0 + sx * 4
            do1 = dst1 + sx * 4
            b0 = src[so]
            b1 = src[so + 1]
            dst[do0] = b0
            dst[do0 + 1] = b1
            dst[do0 + 2] = b0
            dst[do0 + 3] = b1
            dst[do1] = b0
            dst[do1 + 1] = b1
            dst[do1 + 2] = b0
            dst[do1 + 3] = b1
            sx += 1
        sy += 1
"""

try:
    import micropython as _mp
    if hasattr(_mp, "viper"):
        _scale_ns = {"micropython": _mp}
        exec(_SCALE2_VIPER_SRC, _scale_ns)
        _scale2_kernel = _scale_ns["_scale2_kernel"]
except Exception:
    pass


class Display(api.Display):
    def __init__(self):
        spi = SPI(
            1,
            baudrate=pins.DISPLAY_BAUD,
            polarity=0, phase=0,
            sck=Pin(pins.DISPLAY_SCK),
            mosi=Pin(pins.DISPLAY_MOSI),
        )
        self._panel = ST7789(
            spi,
            dc =Pin(pins.DISPLAY_DC,    Pin.OUT),
            cs =Pin(pins.DISPLAY_CS,    Pin.OUT, value=1),
            rst=Pin(pins.DISPLAY_RESET, Pin.OUT, value=1),
            bl =Pin(pins.DISPLAY_BL,    Pin.OUT, value=0),
        )
        self._panel.init()      # no longer turns BL on — see below
        self._buf   = bytearray(api.SCREEN_W * api.SCREEN_H * 2)
        self._fb    = framebuf.FrameBuffer(
            self._buf, api.SCREEN_W, api.SCREEN_H, framebuf.RGB565
        )
        # Push one solid black frame to LCD RAM BEFORE turning the backlight
        # on. Without this the user sees ~1s of random LCD-RAM contents
        # (noisy flicker) on cold boot before the splash starts.
        self._fb.fill(0)
        self._dirty = True
        self.present()
        try:
            self._panel.bl(1)
        except Exception:
            pass
        # PWM the backlight at ~1 kHz so brightness changes are flicker-free.
        # Initialised LAST so PWM is the authoritative driver of the BL pin.
        try:
            from machine import PWM
            self._bl_pwm = PWM(Pin(pins.DISPLAY_BL, Pin.OUT), freq=1000, duty_u16=65535)
        except Exception:
            self._bl_pwm = None

    # ── primitives ────────────────────────────────────────────────────────────

    def clear(self, color=api.BLACK):
        self._fb.fill(_swap(color))
        self._dirty = True

    def pixel(self, x, y, color):
        self._fb.pixel(x, y, _swap(color))
        self._dirty = True

    def line(self, x0, y0, x1, y1, color):
        self._fb.line(x0, y0, x1, y1, _swap(color))
        self._dirty = True

    def rect(self, x, y, w, h, color, fill=False):
        if fill:
            self._fb.fill_rect(x, y, w, h, _swap(color))
        else:
            self._fb.rect(x, y, w, h, _swap(color))
        self._dirty = True

    def text(self, s, x, y, color=api.WHITE, scale=1):
        if scale == 1:
            self._fb.text(s, x, y, _swap(color))
            self._dirty = True
            return
        char_h = 8
        char_w = 8 * len(s)
        mask = bytearray(((char_w + 7) // 8) * char_h)
        mask_fb = framebuf.FrameBuffer(mask, char_w, char_h, framebuf.MONO_HLSB)
        mask_fb.text(s, 0, 0, 1)
        swapped = _swap(color)
        for py in range(char_h):
            for px in range(char_w):
                if mask_fb.pixel(px, py):
                    self._fb.fill_rect(
                        x + px * scale, y + py * scale, scale, scale, swapped)
        self._dirty = True

    def blit(self, sprite, x, y, w, h):
        """Blit a sprite (big-endian RGB565 bytes). Magenta is transparent.

        Fast path: if `sprite` is already a bytearray, framebuf wraps it
        directly with no copy. Apps should cache loaded sprites as bytearray
        (e.g. via the `_load()` helper) to avoid per-blit allocation.
        """
        if isinstance(sprite, bytearray):
            buf = sprite
        else:
            buf = bytearray(sprite[:w * h * 2])
        src = framebuf.FrameBuffer(buf, w, h, framebuf.RGB565)
        self._fb.blit(src, x, y, CHROMA_KEY)
        self._dirty = True

    def blit_2x(self, sprite, x, y, w, h):
        """Native 2× RGB565 expansion directly into the screen buffer."""
        _scale2_kernel(sprite, self._buf, x, y, w, h, api.SCREEN_W)
        self._dirty = True

    def blit_fullscreen(self, sprite):
        """Fast opaque native-frame copy; no framebuf/chroma-key pass."""
        n = api.SCREEN_W * api.SCREEN_H * 2
        if len(sprite) < n:
            return
        self._buf[:] = memoryview(sprite)[:n]
        self._dirty = True

    def blit_scale(self, sprite, x, y, w, h, scale, dim=0.0):
        """Scale sprite up by `scale` and blit. dim 0.0–1.0 blends toward BG.

        Builds a pre-scaled bytearray (row by row with memcpy for Y repeats)
        then stamps it with a single framebuf.blit() call.
        """
        n   = w * h
        sw  = w * scale
        sh  = h * scale
        words = struct.unpack(">%dH" % n, sprite[:n * 2])

        if dim > 0:
            from oreoOS import theme as _t
            br, bg_, bb = _t.BG_R, _t.BG_G, _t.BG_B

        out  = bytearray(sw * sh * 2)
        row  = bytearray(sw * 2)        # one scaled row, little-endian

        for src_row in range(h):
            base_w = src_row * w
            # build one horizontal scaled row
            for col in range(w):
                v = words[base_w + col]
                if dim > 0:
                    r = ((v >> 11) & 0x1F) << 3
                    g = ((v >>  5) & 0x3F) << 2
                    b = ( v        & 0x1F) << 3
                    r = int(r + (br  - r) * dim)
                    g = int(g + (bg_ - g) * dim)
                    b = int(b + (bb  - b) * dim)
                    v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
                # store big-endian (matches framebuf convention here)
                b1 = v >> 8        # high byte first
                b0 = v & 0xFF      # low byte second
                base = col * scale * 2
                for dx in range(scale):
                    row[base + dx * 2]     = b1
                    row[base + dx * 2 + 1] = b0

            # stamp the row `scale` times vertically via memcpy
            row_start = src_row * scale * sw * 2
            for dy in range(scale):
                s = row_start + dy * sw * 2
                out[s: s + sw * 2] = row

        src_fb = framebuf.FrameBuffer(out, sw, sh, framebuf.RGB565)
        self._fb.blit(src_fb, x, y)
        self._dirty = True

    # ── flush ─────────────────────────────────────────────────────────────────

    def set_brightness(self, pct):
        """Set backlight brightness (0..100). PWM-based, flicker-free."""
        pct = max(0, min(100, int(pct)))
        if self._bl_pwm is not None:
            self._bl_pwm.duty_u16(int(pct / 100.0 * 65535))
        else:
            # No PWM available — fall back to plain on/off
            self._panel.bl(1 if pct > 0 else 0)

    def present(self):
        """Push framebuffer to display — no-op if nothing was drawn since last call.

        Address window was set ONCE at init (full screen); we only re-issue
        RAMWR (0x2C) to reset the GRAM write pointer to (0,0).

        The full-frame transfer (153,600 bytes at 26 MHz ≈ 47 ms) is
        split into 4 quarters with brief idle gaps. The chunking spreads
        the current spike over a longer window so the breadboard 3V3 LDO
        sees a smoother load — eliminates the ~2 Hz backlight dim pulse
        that otherwise tracks the auto-GC cycle.
        """
        if not self._dirty:
            return
        self._dirty = False
        p   = self._panel
        mv  = memoryview(self._buf)
        n   = len(self._buf)
        q   = n >> 2          # 1/4 of the buffer (38,400 bytes)
        p.cs(0)
        p.dc(0); p.spi.write(p._ramwr_cmd)
        p.dc(1)
        p.spi.write(mv[0:    q])
        utime_sleep_us(200)
        p.spi.write(mv[q:   2*q])
        utime_sleep_us(200)
        p.spi.write(mv[2*q: 3*q])
        utime_sleep_us(200)
        p.spi.write(mv[3*q:    n])
        p.cs(1)

    def present_rect(self, x, y, w, h):
        if not self._dirty:
            return
        self._dirty = False
        p = self._panel
        p.set_window(x, y, x + w - 1, y + h - 1)
        p.cs(0)
        p.dc(0); p.spi.write(b'\x2C')
        p.dc(1)
        stride = api.SCREEN_W * 2
        row_start = y * stride + x * 2
        row_len = w * 2
        buf = self._buf
        for _ in range(h):
            p.spi.write(buf[row_start: row_start + row_len])
            row_start += stride
        p.cs(1)
