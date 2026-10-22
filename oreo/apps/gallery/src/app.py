"""Gallery — browse photos and device-native videos.

The carousel always has one extra "ADD" tile at the end. Selecting it
opens a scrollable instruction panel for adding bundled photos; WiFi uploads
can add photos and videos directly.

Controls:
  LEFT / RIGHT   previous / next tile (photos + the ADD tile at the end)
  UP   / DOWN    seek -5/+5 seconds in video; scroll ADD instructions
  A              play/pause video, or refresh the media listing
  B              delete the currently-shown uploaded media (frees flash).
                 Only enabled on .r565/.rv565 uploads — baked .py photos are
                 part of the deploy and removing them would just have
                 the next deploy push them back.
  HOME           apps drawer
"""

import gc as _gc
import os as _os
import struct as _struct
import time as _time
import oreoOS
from oreoOS import api
from oreoOS import theme, widgets

try:
    # Architecture-matched dynamic C module. CPython/simulator builds simply
    # use the portable paths below because they cannot import an Xtensa .mpy.
    from . import gallery_native as _gallery_native
except Exception:
    _gallery_native = None

try:
    # Built into the OreoOS MicroPython firmware.  RV565 v6 frames are
    # inflated by the ESP32-S3 ROM miniz routine directly between two reused
    # buffers; no temporary Python bytes object is created on this path.
    import _oreo_rv565
except Exception:
    _oreo_rv565 = None

SW = api.SCREEN_W
SH = api.SCREEN_H


_GALLERY_DIR = "apps/gallery/assets/optimized"
_BENCHMARK_FLAG = "/.rv565-benchmark"
_BENCHMARK_WARMUP = 48
_BENCHMARK_FRAMES = 720
_BENCHMARK_FIELDS = 9
_BENCHMARK_RECORD_SIZE = _BENCHMARK_FIELDS * 4


def _list_photos():
    """Both formats land here:
      .py    — laptop-optimised, baked at deploy time
      .r565  — uploaded over WiFi, written by oreoOS.http_server in the
               on-device-renderable binary format defined below.
    Returned names include their extension so _load_photo can dispatch."""
    try:
        out = []
        for f in _os.listdir(_GALLERY_DIR):
            if f.startswith("_"):
                continue
            if (f.endswith(".py") or f.endswith(".r565") or
                    f.endswith(".rz565") or
                    f.endswith(".rv565")):
                out.append(f)
        out.sort()
        return out
    except OSError:
        return []


def _load_photo(name):
    """name is the full filename ('sunset.py' / 'upload_1234.r565').
    Dispatch on extension."""
    if name.endswith(".r565"):
        return _load_r565(_GALLERY_DIR + "/" + name)
    if name.endswith(".rz565"):
        return _load_rz565(_GALLERY_DIR + "/" + name)
    if name.endswith(".py"):
        stem = name[:-3]
        try:
            mod = __import__("apps.gallery.assets.optimized." + stem,
                             None, None, ["DATA", "W", "H"])
            return (bytearray(mod.DATA), mod.W, mod.H)
        except (ImportError, AttributeError):
            return None
    return None


_VIDEO_HEADER_SIZE = 12


class _Video:
    """Streaming RV565 decoder with legacy v1-v3 compatibility.

    V4 keeps only an 8-bit indexed frame and its RGB565 palette in RAM. The
    Gallery native module expands it directly into the display framebuffer.
    """

    def __init__(self, path):
        self._path = path
        self._inflate = None
        self._frames_data = None
        self._loaded = 0
        self._payload_size = 0
        self._frame_size = 0
        self._frame_offsets = None
        self._load_error = False
        self.last_read_us = 0
        self.last_inflate_us = 0
        self.frame_offset = 0
        self._f = open(path, "rb")
        head = self._f.read(_VIDEO_HEADER_SIZE)
        if (len(head) != _VIDEO_HEADER_SIZE or head[:3] != b"RV5" or
                head[3] not in (1, 2, 3, 4, 6)):
            self.close()
            raise ValueError("bad RV565 header")
        self.version = head[3]
        self.w = head[4] | (head[5] << 8)
        self.h = head[6] | (head[7] << 8)
        self.fps = head[8]
        self.frames = head[10] | (head[11] << 8)
        if (self.w <= 0 or self.h <= 0 or self.w > 320 or self.h > 240 or
                self.fps <= 0 or self.fps > 30 or self.frames <= 0):
            self.close()
            raise ValueError("bad RV565 dimensions")
        # V4 stores one 256-colour RGB565 palette plus one byte per source
        # pixel. C expands it directly into the LCD framebuffer in ~8 ms.
        # Older versions retain their RGB565 frame buffer for compatibility.
        if self.version == 4:
            if _gallery_native is None:
                self.close()
                raise ValueError("native video decoder unavailable")
            self.palette = None
            self.data = None
            self._frame_size = 512 + self.w * self.h
            self._payload_size = self._frame_size * self.frames
            try:
                if _os.stat(path)[6] != _VIDEO_HEADER_SIZE + self._payload_size:
                    raise ValueError("bad RV565 v4 size")
                # Allocate frames incrementally while loading. A single 5-6 MB
                # bytearray is fragile after normal UI use because the heap can
                # have enough total space but no equally-large contiguous run.
                self._frames_data = []
            except Exception:
                self.close()
                raise
        else:
            self.palette = None
            self.data = bytearray(self.w * self.h * 2)
        # Reused compressed-frame buffer. The old decoder issued one flash
        # read per command (hundreds per frame), which reduced real playback
        # to ~0.5 FPS and starved button polling. One readinto() per frame is
        # both allocation-free and dramatically faster.
        packed_cap = (0 if self.version in (3, 4) else
                      len(self.data) + 1024 if self.version in (2, 6) else
                      len(self.data) + (len(self.data) // 2) + 16)
        self._packed = bytearray(packed_cap)
        self.index = 0
        if self.version == 3:
            self._open_stream()

    def _open_stream(self):
        """Open one persistent native inflater for an RV565 v3 stream."""
        try:
            import deflate
            self._inflate = deflate.DeflateIO(self._f)
        except Exception:
            self._inflate = None

    def close(self):
        f = getattr(self, "_f", None)
        self._f = None
        self._inflate = None
        self._frames_data = None
        if f is not None:
            try:
                f.close()
            except Exception:
                pass

    @property
    def ready(self):
        return (self.version != 4 or
                self._loaded == self._payload_size)

    @property
    def load_percent(self):
        if self.version != 4 or self._payload_size <= 0:
            return 100
        return self._loaded * 100 // self._payload_size

    def load_step(self, frames_per_step=3):
        """Read a few complete V4 frames; keeps loader/input responsive."""
        if self.version != 4 or self.ready:
            return True
        try:
            for _ in range(frames_per_step):
                if self.ready:
                    break
                frame = bytearray(self._frame_size)
                target = memoryview(frame)
                total = 0
                while total < self._frame_size:
                    n = self._f.readinto(target[total:])
                    if not n:
                        self._load_error = True
                        break
                    total += n
                if self._load_error:
                    break
                self._frames_data.append(frame)
                self._loaded += self._frame_size
        except Exception:
            self._load_error = True
        if self.ready or self._load_error:
            try:
                self._f.close()
            except Exception:
                pass
            self._f = None
        return self.ready

    def rewind(self):
        if self.version == 4:
            self.index = 0
            self.frame_offset = 0
            return
        if self.version == 3:
            try:
                self._f.close()
            except Exception:
                pass
            self._f = open(self._path, "rb")
            self._f.read(_VIDEO_HEADER_SIZE)
            self._open_stream()
            self.index = 0
            return
        self._f.seek(_VIDEO_HEADER_SIZE)
        if self.version in (2, 4, 6):
            self.index = 0
            return
        # Clear in small chunks so looping a clip does not briefly allocate a
        # second frame-sized object on the MicroPython heap.
        zero = b"\x00" * min(256, len(self.data))
        for off in range(0, len(self.data), len(zero)):
            self.data[off:off + len(zero)] = zero[:len(self.data) - off]
        self.index = 0

    def _index_independent_frames(self):
        """Build a small, lazy frame-offset table for V2/V6 seeking."""
        if self.version not in (2, 6) or self._f is None:
            return False
        if self._frame_offsets is not None:
            return True
        offsets = []
        try:
            pos = _VIDEO_HEADER_SIZE
            for _ in range(self.frames):
                self._f.seek(pos)
                size_b = self._f.read(4)
                if len(size_b) != 4:
                    return False
                size = (size_b[0] | (size_b[1] << 8) |
                        (size_b[2] << 16) | (size_b[3] << 24))
                if size <= 0 or size > len(self._packed):
                    return False
                offsets.append(pos)
                pos += 4 + size
            self._frame_offsets = offsets
            return True
        except Exception:
            return False

    def seek_frame(self, frame):
        """Decode an independently stored frame without walking the clip."""
        frame = max(0, min(self.frames - 1, int(frame)))
        if self.version == 4:
            if not self.ready:
                return False
            self.index = frame
            return self.next_frame()
        if self.version in (2, 6):
            if not self._index_independent_frames():
                return False
            self._f.seek(self._frame_offsets[frame])
            self.index = frame
            return self.next_frame()
        return False

    def next_frame(self):
        """Decode one delta frame in place. Returns False on corrupt/EOF."""
        if self.version == 4:
            if not self.ready or self.index >= self.frames:
                return False
            self.frame_offset = self.index
            self.index += 1
            return True
        if self._f is None:
            return False
        if self.version == 3:
            if self._inflate is None:
                return False
            total = 0
            target = memoryview(self.data)
            try:
                while total < len(self.data):
                    n = self._inflate.readinto(target[total:])
                    if not n:
                        break
                    total += n
            except Exception:
                return False
            if total != len(self.data):
                return False
            self.index += 1
            return True
        size_b = self._f.read(4)
        if len(size_b) != 4:
            return False
        left = (size_b[0] | (size_b[1] << 8) |
                (size_b[2] << 16) | (size_b[3] << 24))
        if left <= 0 or left > len(self._packed):
            return False
        packed_view = memoryview(self._packed)[:left]
        read_start = _time.ticks_us()
        try:
            got = self._f.readinto(packed_view)
        except Exception:
            got = 0
        self.last_read_us = _time.ticks_diff(_time.ticks_us(), read_start)
        if got != left:
            return False

        if self.version in (2, 6):
            # V2/V6 store independent zlib frames. V6 keeps the benchmark's
            # high-quality 180x135 RGB565 source. Custom OreoOS firmware
            # inflates V6 directly into the reusable frame buffer; native C
            # scales it below.
            try:
                if self.version == 6 and _oreo_rv565 is not None:
                    inflate_start = _time.ticks_us()
                    _oreo_rv565.inflate_frame(packed_view, self.data)
                    self.last_inflate_us = _time.ticks_diff(
                        _time.ticks_us(), inflate_start)
                    self.index += 1
                    return True
                packed = bytes(packed_view)
                try:
                    import deflate
                    import io
                    inflater = deflate.DeflateIO(io.BytesIO(packed))
                    readinto = getattr(inflater, "readinto", None)
                    if readinto is not None:
                        total = 0
                        target = memoryview(self.data)
                        while total < len(self.data):
                            n = readinto(target[total:])
                            if not n:
                                break
                            total += n
                        raw = None if total == len(self.data) else b""
                    else:
                        raw = inflater.read()
                except ImportError:
                    import zlib
                    raw = zlib.decompress(packed)
            except Exception:
                return False
            if raw is not None:
                if len(raw) != self.w * self.h * 2:
                    return False
                self.data[:] = raw
            self.index += 1
            return True

        pixel = 0
        src = 0
        pixels = self.w * self.h
        while src < left and pixel < pixels:
            command = self._packed[src]
            src += 1
            op = command >> 6
            count = (command & 0x3f) + 1
            if pixel + count > pixels:
                return False
            if op == 0:                 # unchanged pixels
                pixel += count
            elif op == 1:               # literal RGB565 pixels
                n = count * 2
                if src + n > left:
                    return False
                start = pixel * 2
                self.data[start:start + n] = packed_view[src:src + n]
                pixel += count
                src += n
            elif op == 2:               # one RGB565 colour repeated
                if src + 2 > left:
                    return False
                colour = bytes((self._packed[src], self._packed[src + 1]))
                src += 2
                off = pixel * 2
                # count is capped at 64, so this creates at most a 128-byte
                # temporary and lets native slice assignment do the hot copy.
                self.data[off:off + count * 2] = colour * count
                pixel += count
            else:
                return False
        if pixel != pixels or src != left:
            return False
        self.index += 1
        return True


def _load_r565(path):
    """Read a 6-byte header (magic + W + H, little-endian) and the
    following W*H*2 bytes of RGB565 pixel data. Mirrors the binary
    format the upload page produces in the browser canvas pipeline."""
    try:
        with open(path, "rb") as f:
            head = f.read(6)
            if len(head) < 6 or head[0] != 0x52 or head[1] != 0x35:
                return None
            w = head[2] | (head[3] << 8)
            h = head[4] | (head[5] << 8)
            if w <= 0 or h <= 0 or w > 320 or h > 320:
                return None
            data = f.read(w * h * 2)
        if len(data) < w * h * 2:
            return None
        return (bytearray(data), w, h)
    except Exception:
        return None


def _load_rz565(path):
    """Inflate R5Z v1 once when a photo is opened.

    The compressed file stays small on flash; the normal Gallery cache owns
    the decoded RGB565 buffer until the user leaves that photo.
    """
    try:
        import deflate
        import io
        with open(path, "rb") as f:
            head = f.read(12)
            if len(head) != 12 or head[:4] != b"R5Z\x01":
                return None
            w = head[4] | (head[5] << 8)
            h = head[6] | (head[7] << 8)
            raw_len = (head[8] | (head[9] << 8) |
                       (head[10] << 16) | (head[11] << 24))
            if (w <= 0 or h <= 0 or w > 320 or h > 240 or
                    raw_len != w * h * 2):
                return None
            data = deflate.DeflateIO(io.BytesIO(f.read())).read()
        if len(data) != raw_len:
            return None
        return (bytearray(data), w, h)
    except Exception:
        return None


# Instruction text laid out as a list of (kind, payload). kind is "h"
# (heading), "b" (bullet), or "code" (monospace command). Centralised
# here so the panel renderer stays simple.
_HELP = [
    ("h",   "Add bundled photos"),
    ("b",   "Drop a JPG or PNG into"),
    ("code","apps/gallery/assets/raw/"),
    ("b",   "Square images render best;"),
    ("b",   "max ~240x240 to fit the LCD."),
    ("h",   "Optimise it"),
    ("b",   "From the repo root run:"),
    ("code","python tools/optimize_assets.py"),
    ("code","         --app gallery"),
    ("b",   "This bakes each raw image into"),
    ("b",   "a tiny RGB565 .py module."),
    ("h",   "Flash the badge"),
    ("b",   "Plug in the badge over USB then:"),
    ("code","python tools/deploy.py"),
    ("b",   "The deploy script auto-skips"),
    ("b",   "unchanged files (use --force to"),
    ("b",   "push everything)."),
    ("h",   "On the badge"),
    ("b",   "Open Gallery, press A to refresh"),
    ("b",   "the listing. New media appears"),
    ("b",   "in alphabetical order."),
]


def _wrap_help(text, max_chars):
    """Greedy word-wrap for the ADD-tile help splash.

    Splits `text` into a list of lines, each no longer than `max_chars`
    characters. Breaks on whitespace; if a single word is longer than
    `max_chars`, hard-truncates that word across multiple lines (rare —
    only happens on URLs etc., and our _HELP corpus avoids them).
    Mirrors apps/reader/main.py's _wrap_help; the two splashes are
    intentionally a family so the same word-wrap behaviour applies.
    """
    if max_chars <= 0:
        return [text]
    out  = []
    rest = text.split()
    cur  = ""
    while rest:
        w    = rest[0]
        cand = (cur + " " + w) if cur else w
        if len(cand) <= max_chars:
            cur = cand
            rest.pop(0)
            continue
        if cur:
            out.append(cur)
            cur = ""
            continue
        out.append(w[:max_chars])
        rest[0] = w[max_chars:]
    if cur:
        out.append(cur)
    return out or [""]


class App(oreoOS.App):
    name         = "Gallery"
    author       = "Circuit-Overtime"
    # _list_photos() + first-photo decode walks assets/optimized/ and
    # imports each baked RGB565 module. Cold-launch on a populated
    # gallery is in the 400-800 ms range — without the splash, the user
    # stares at the previous app's frame until the first photo lands.
    # Matches the pattern already used by Storage / Reader / Settings.
    SHOW_LOADING = True

    def on_enter(self, os):
        self._os    = os
        self._names = _list_photos()
        self._idx   = 0
        self._scroll = 0
        self._cache = {}
        # Per-photo nearest-neighbour downscale cache. Keyed by
        # (filename, target_w, target_h) so the same photo can hold
        # multiple sizes — currently we only ever need one, but the
        # extra key dimensions cost nothing and make a future fit-mode
        # toggle trivial. Cleared whenever the source list changes.
        self._scaled_cache = {}
        self._video = None
        self._video_name = ""
        self._video_playing = True
        self._video_elapsed = 0.0
        self._video_needs_clear = True
        self._video_error = ""
        self._video_failed_name = ""
        self._dirty = True
        self._bench_enabled = False
        self._bench_done = 0
        self._bench_samples = 0
        self._bench_misses = 0
        self._bench_first_us = 0
        self._bench_elapsed_us = 0
        self._bench_pending_active = False
        self._bench_pending = [0, 0, 0, 0, 0, 0]
        self._bench_data = None
        try:
            _os.stat(_BENCHMARK_FLAG)
            _os.remove(_BENCHMARK_FLAG)
            for index, name in enumerate(self._names):
                if name.endswith(".rv565"):
                    self._idx = index
                    self._bench_enabled = True
                    self._bench_data = bytearray(
                        _BENCHMARK_FRAMES * _BENCHMARK_RECORD_SIZE)
                    print("RV565_OS_READY,warmup=%d,sample_frames=%d,media=%s" % (
                        _BENCHMARK_WARMUP, _BENCHMARK_FRAMES, name))
                    break
            if not self._bench_enabled:
                print("RV565_OS_ERROR,no_rv565_media")
        except OSError:
            pass

    def on_exit(self):
        self._close_video()

    def realtime_mode(self):
        """Tell the OS scheduler that video owns the frame budget.

        Buttons are still polled every loop, but OTA, transfer-server and
        watchdog housekeeping are deferred until playback is paused or the
        user leaves the clip.
        """
        return self._is_video() and self._video_playing

    def _close_video(self):
        if self._video is not None:
            self._video.close()
        self._video = None
        self._video_name = ""
        self._video_elapsed = 0.0
        self._video_needs_clear = True
        _gc.collect()

    def _is_video(self):
        return (not self._is_add_tile() and self._idx < len(self._names) and
                self._names[self._idx].endswith(".rv565"))

    def _open_video(self):
        if not self._is_video():
            self._close_video()
            return None
        name = self._names[self._idx]
        if self._video_failed_name == name:
            return None
        if self._video is not None and self._video_name == name:
            return self._video
        self._close_video()
        try:
            # A preloaded V4 clip needs most of PSRAM. Drop photo caches before
            # allocating its small frame blocks; photos are cheap to reload.
            self._cache = {}
            self._scaled_cache = {}
            _gc.collect()
            self._video = _Video(_GALLERY_DIR + "/" + name)
            self._video_name = name
            self._video_playing = True
            if self._video.version != 4 and not self._video.next_frame():
                self._close_video()
        except Exception as exc:
            self._video_error = "%s: %s" % (type(exc).__name__, exc)
            self._video_failed_name = name
            try:
                print("Gallery video open failed:", self._video_error)
            except Exception:
                pass
            self._close_video()
        return self._video

    def _is_add_tile(self):
        return self._idx == len(self._names)

    def _photo(self, idx):
        name = self._names[idx]
        if name not in self._cache:
            self._cache[name] = _load_photo(name)
        return self._cache.get(name)

    def on_button_press(self, btn):
        total = len(self._names) + 1     # photos + ADD tile
        if self._is_video() and btn in (api.BTN_UP, api.BTN_DOWN):
            self._seek_video(-5 if btn == api.BTN_UP else 5)
            return
        if btn == api.BTN_LEFT:
            self._close_video()
            self._video_failed_name = ""
            self._video_error = ""
            self._idx = (self._idx - 1) % total
            self._scroll = 0
            self._dirty = True
        elif btn == api.BTN_RIGHT:
            self._close_video()
            self._video_failed_name = ""
            self._video_error = ""
            self._idx = (self._idx + 1) % total
            self._scroll = 0
            self._dirty = True
        elif btn == api.BTN_UP and self._is_add_tile():
            self._scroll = max(0, self._scroll - 1)
            self._dirty = True
        elif btn == api.BTN_DOWN and self._is_add_tile():
            self._scroll = min(self._scroll + 1, max(0, len(_HELP) - 1))
            self._dirty = True
        elif btn == api.BTN_A:
            if self._is_video():
                self._open_video()
                self._video_playing = not self._video_playing
                self._dirty = True
                return
            # Refresh listing (e.g., after dropping new media on the FS)
            self._close_video()
            self._video_failed_name = ""
            self._video_error = ""
            self._names = _list_photos()
            self._cache = {}
            self._scaled_cache = {}
            self._idx   = 0
            self._scroll = 0
            self._dirty = True
        elif btn == api.BTN_B:
            # Delete the currently-selected upload. Only .r565/.rv565 files
            # (WiFi uploads) get deleted from flash — .py files are
            # part of the deploy and a delete would only persist
            # until the next `python tools/deploy.py`. Refusing them
            # here avoids the surprise of "I deleted it but it came
            # back."
            if self._is_add_tile():
                return
            name = self._names[self._idx] if self._idx < len(self._names) else ""
            if not name or not name.endswith((".r565", ".rz565", ".rv565")):
                return
            self._close_video()
            path = _GALLERY_DIR + "/" + name
            try:
                _os.remove(path)
            except OSError:
                pass
            # Drop the cache entry so a re-add doesn't show stale bytes.
            self._cache.pop(name, None)
            # Drop any cached downscales that referenced this photo too
            # — the keys embed the filename so a single pass clears them.
            self._scaled_cache = {k: v for k, v in self._scaled_cache.items()
                                  if k[0] != name}
            self._names = _list_photos()
            # Clamp the cursor: prefer staying on the same index so
            # the next photo slides under the user's finger. If we
            # were on the last real photo, the ADD tile is now under
            # us, which is also fine.
            if self._idx >= len(self._names) + 1:
                self._idx = max(0, len(self._names))
            self._scroll = 0
            self._dirty = True

    def _seek_video(self, seconds):
        video = self._open_video()
        if video is None or not video.ready:
            return
        shown = max(0, video.index - 1)
        target = shown + int(seconds * video.fps)
        if video.seek_frame(target):
            self._video_elapsed = 0.0
            self._dirty = True

    def update(self, dt):
        if not self._is_video():
            return
        video = self._open_video()
        if video is None:
            return
        if video.version == 4 and not video.ready:
            video.load_step()
            if video._load_error:
                self._video_error = "read or memory error"
                self._video_failed_name = self._video_name
                self._close_video()
                return
            self._dirty = True
            if not video.ready:
                return
            if not video.next_frame():
                self._close_video()
                return
            self._video_elapsed = 0.0
            return
        if not self._video_playing:
            return
        self._video_elapsed += dt
        frame_time = 1.0 / video.fps
        # Decode at most one frame per OS tick. If a slow frame makes us late,
        # discard accumulated delay rather than decoding a burst and stalling.
        if self._video_elapsed < frame_time:
            return
        self._video_elapsed %= frame_time
        work_start_us = (_time.ticks_us() if self._bench_enabled else 0)
        if video.index >= video.frames or not video.next_frame():
            try:
                video.rewind()
                if not video.next_frame():
                    self._close_video()
                    return
            except Exception:
                self._close_video()
                return
        if (self._bench_enabled and
                self._bench_done < _BENCHMARK_WARMUP + _BENCHMARK_FRAMES):
            pending = self._bench_pending
            pending[0] = max(0, video.index - 1)
            pending[1] = work_start_us
            pending[2] = video.last_read_us
            pending[3] = video.last_inflate_us
            pending[4] = 0
            pending[5] = 0
            self._bench_pending_active = True
        self._dirty = True

    def draw(self, d):
        if not self._dirty:
            return
        # Video owns the complete viewport. Avoid rebuilding Gallery's header,
        # hint bar, and carousel chrome for every frame.
        if self._is_video():
            self._draw_video(d)
            self._dirty = False
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "GALLERY")
        if self._is_add_tile():
            widgets.draw_hint(d, "UP/DOWN=scroll  L/R=back")
        else:
            # Only advertise B=delete for uploaded photos, since baked
            # .py photos refuse the delete and silently confusing the
            # user with a hint that doesn't fire is worse than no hint.
            cur_name = (self._names[self._idx]
                        if self._idx < len(self._names) else "")
            if cur_name.endswith(".rv565"):
                state = "pause" if self._video_playing else "play"
                widgets.draw_hint(d, "L/R=next  A=%s  B=delete" % state)
            elif cur_name.endswith((".r565", ".rz565")):
                widgets.draw_hint(d, "L/R=prev/next  A=refresh  B=delete")
            else:
                widgets.draw_hint(d, "L/R=prev/next  A=refresh")

        # n/n counter inside the header bar (right-aligned). ADD tile counts
        # too so the user knows there's something after the last photo.
        total   = len(self._names) + 1
        idx_str = "%d/%d" % (self._idx + 1, total)
        d.text(idx_str, SW - len(idx_str) * 8 - 6,
               (widgets.HEADER_H - 8) // 2, api.WHITE)

        if self._is_add_tile():
            self._draw_add_tile(d)
        else:
            self._draw_photo(d)

        self._dirty = False

    def _draw_video(self, d):
        draw_start_us = (_time.ticks_us()
                         if self._bench_pending_active else 0)
        scale_us = 0
        video = self._open_video()
        if self._video_needs_clear:
            d.clear(api.BLACK)
            self._video_needs_clear = False
        if video is None:
            d.text("broken video", (SW - 12 * 16) // 2, SH // 2 - 8,
                   theme.MUTED, scale=2)
            if self._video_error:
                msg = self._video_error[:36]
                d.text(msg, (SW - len(msg) * 8) // 2, SH // 2 + 14,
                       theme.MUTED)
        else:
            if video.version == 4 and not video.ready:
                d.clear(api.BLACK)
                label = "LOADING VIDEO %d%%" % video.load_percent
                d.text(label, (SW - len(label) * 8) // 2,
                       SH // 2 - 18, api.WHITE)
                bx, by, bw, bh = 30, SH // 2 + 4, SW - 60, 10
                d.rect(bx, by, bw, bh, theme.MUTED, fill=False)
                fill = (bw - 4) * video.load_percent // 100
                if fill:
                    d.rect(bx + 2, by + 2, fill, bh - 4,
                           theme.PRIMARY, fill=True)
                return
            # V4 is expanded and scaled straight into Display._buf by C. It
            # avoids a 153 KB intermediate frame and all Python pixel loops.
            native_buf = getattr(d, "_buf", None)
            if (video.version == 4 and _gallery_native is not None and
                    native_buf is not None):
                _gallery_native.indexed_scale_at(
                    video._frames_data[video.frame_offset], 0, native_buf,
                    video.w, video.h, SW, SH)
                # We intentionally use the hardware buffer directly to keep
                # the accelerator Gallery-local. Tell Display to flush it.
                d._dirty = True
            elif (video.version == 6 and _gallery_native is not None and
                    native_buf is not None):
                scale_start_us = (_time.ticks_us()
                                  if self._bench_pending_active else 0)
                _gallery_native.rgb565_scale(
                    video.data, native_buf, video.w, video.h,
                    0, 0, SW, SH, SW)
                if self._bench_pending_active:
                    scale_us = _time.ticks_diff(
                        _time.ticks_us(), scale_start_us)
                d._dirty = True
            # V2 uploads are already native LCD frames: one C-level buffer copy
            # replaces the old Python scaling loop. V1 remains readable for
            # compatibility, but re-uploading upgrades it to this fast path.
            elif (video.version == 2 and video.w == SW and video.h == SH and
                    getattr(d, "blit_fullscreen", None) is not None):
                d.blit_fullscreen(video.data)
            elif (getattr(d, "blit_2x", None) is not None and
                    video.w * 2 <= SW and video.h * 2 <= SH):
                px = (SW - video.w * 2) // 2
                py = (SH - video.h * 2) // 2
                d.blit_2x(video.data, px, py, video.w, video.h)
            else:
                px = (SW - video.w) // 2
                py = (SH - video.h) // 2
                d.blit(video.data, px, py, video.w, video.h)
            if not self._video_playing:
                # Small pause badge over the frame.
                d.rect(SW // 2 - 15, SH // 2 - 15, 30, 30,
                       theme.BG, fill=True)
                d.rect(SW // 2 - 7, SH // 2 - 8, 4, 16,
                       api.WHITE, fill=True)
                d.rect(SW // 2 + 3, SH // 2 - 8, 4, 16,
                       api.WHITE, fill=True)

            # Compact always-visible playback HUD. It overlays the final 22
            # rows, so video still owns the complete 320x240 viewport.
            hud_y = SH - 22
            d.rect(0, hud_y, SW, 22, api.BLACK, fill=True)
            track_y = hud_y + 2
            d.rect(6, track_y, SW - 12, 3, theme.MUTED, fill=True)
            progress = min(video.frames, max(0, video.index))
            fill = (SW - 12) * progress // max(1, video.frames)
            if fill:
                d.rect(6, track_y, fill, 3, theme.PRIMARY, fill=True)
            elapsed = max(0, video.index - 1) // video.fps
            duration = (video.frames + video.fps - 1) // video.fps
            left = "%d:%02d" % (elapsed // 60, elapsed % 60)
            right = "%d:%02d" % (duration // 60, duration % 60)
            hint = ("UP/DN seek  A pause" if self._video_playing
                    else "UP/DN seek  A play")
            d.text(left, 6, hud_y + 9, api.WHITE)
            d.text(hint, (SW - len(hint) * 8) // 2, hud_y + 9, api.WHITE)
            d.text(right, SW - len(right) * 8 - 6, hud_y + 9, api.WHITE)
        if self._bench_pending_active:
            self._bench_pending[4] = scale_us
            self._bench_pending[5] = _time.ticks_diff(
                _time.ticks_us(), draw_start_us)

    def after_present(self, elapsed_us):
        """Record one complete OreoOS Gallery frame after its LCD flush."""
        if not self._bench_enabled or not self._bench_pending_active:
            return
        self._bench_pending_active = False
        finished_us = _time.ticks_us()
        pending = self._bench_pending
        work_us = _time.ticks_diff(finished_us, pending[1])
        self._bench_done += 1
        if self._bench_done <= _BENCHMARK_WARMUP:
            return

        sequence = self._bench_samples
        if sequence == 0:
            self._bench_first_us = pending[1]
        period_us = 1000000 // max(1, self._video.fps)
        missed = 1 if work_us > period_us else 0
        self._bench_misses += missed
        _struct.pack_into(
            "<9I", self._bench_data, sequence * _BENCHMARK_RECORD_SIZE,
            sequence, pending[0], pending[2], pending[3], pending[4],
            pending[5], elapsed_us, work_us, missed)
        self._bench_samples += 1
        if self._bench_samples < _BENCHMARK_FRAMES:
            return

        self._bench_elapsed_us = _time.ticks_diff(
            finished_us, self._bench_first_us)
        self._video_playing = False
        fps = (_BENCHMARK_FRAMES * 1000000.0 /
               max(1, self._bench_elapsed_us))
        print("RV565_OS_COLUMNS,sequence,source_frame,read_us,inflate_us,"
              "scale_us,draw_us,present_us,work_us,deadline_missed")
        print("RV565_OS_SUMMARY,frames=%d,elapsed_us=%d,fps=%.6f,drops=0,"
              "deadline_misses=%d" % (
                  _BENCHMARK_FRAMES, self._bench_elapsed_us, fps,
                  self._bench_misses))
        for index in range(_BENCHMARK_FRAMES):
            values = _struct.unpack_from(
                "<9I", self._bench_data,
                index * _BENCHMARK_RECORD_SIZE)
            print("RV565_OS_FRAME,%d,%d,%d,%d,%d,%d,%d,%d,%d" % values)
        print("RV565_OS_END")
        self._bench_enabled = False

    # ── photo render ─────────────────────────────────────────────────────
    def _draw_photo(self, d):
        ph = self._photo(self._idx)
        ay = widgets.HEADER_H + 8
        ah = SH - widgets.HEADER_H - widgets.HINT_H - 16
        if ph:
            data, pw, phh = ph
            # Fit the photo entirely inside the play area while
            # preserving aspect ratio. The browser caps uploads at
            # 240x240 and the play area on a 320x240 screen is
            # ~296x180 after the header/hint bars — so a 240x240
            # photo gets downscaled to ~180x180 with the remaining
            # horizontal space showing as background letterboxing.
            avail_w, avail_h = SW - 8, ah
            if pw <= avail_w and phh <= avail_h:
                # Fits as-is.
                blit_data, view_w, view_h = data, pw, phh
            else:
                # Nearest-neighbour downscale to fit. Integer math
                # rather than floats so it runs fast enough on MP.
                # NN over bilinear because the source is already small
                # (≤240) and bilinear would need 4 reads per output
                # pixel — too slow in pure Python.
                view_w = avail_w
                view_h = phh * avail_w // pw
                if view_h > avail_h:
                    view_h = avail_h
                    view_w = pw * avail_h // phh
                view_w = max(1, view_w)
                view_h = max(1, view_h)
                native_buf = getattr(d, "_buf", None)
                if _gallery_native is not None and native_buf is not None:
                    _gallery_native.rgb565_scale(
                        data, native_buf, pw, phh,
                        (SW - view_w) // 2, ay + (ah - view_h) // 2,
                        view_w, view_h, SW)
                    d._dirty = True
                    blit_data = None
                else:
                    key = (self._names[self._idx], view_w, view_h)
                    blit_data = self._scaled_cache.get(key)
                if blit_data is None and not (
                        _gallery_native is not None and native_buf is not None):
                    row_src = pw * 2
                    row_dst = view_w * 2
                    out = bytearray(row_dst * view_h)
                    for r in range(view_h):
                        sy = r * phh // view_h
                        src_row_base = sy * row_src
                        # Inner loop: nearest neighbour pixel pick.
                        # Loop-local bindings shave off attribute
                        # lookups in MicroPython.
                        d_off = r * row_dst
                        for c in range(view_w):
                            sx = (c * pw // view_w) * 2
                            so = src_row_base + sx
                            out[d_off]     = data[so]
                            out[d_off + 1] = data[so + 1]
                            d_off += 2
                    blit_data = out
                    self._scaled_cache[key] = out
            px = (SW - view_w) // 2
            py = ay + (ah - view_h) // 2
            if blit_data is not None:
                d.blit(blit_data, px, py, view_w, view_h)
        else:
            d.text("broken photo", (SW - 12 * 16) // 2, ay + 40,
                   theme.MUTED, scale=2)

        # ◀ / ▶ chevrons on the edges so the user knows the carousel cycles.
        # The carousel always wraps (includes the ADD tile), so both sides
        # are always navigable — render both arrows unconditionally.
        ar_y = ay + ah // 2 - 8
        d.text("<", 4,      ar_y, theme.PRIMARY, scale=2)
        d.text(">", SW - 18, ar_y, theme.PRIMARY, scale=2)

    # ── ADD tile: scrollable instructions ────────────────────────────────
    def _draw_add_tile(self, d):
        # Cream card filling the play area.
        card_x = 10
        card_y = widgets.HEADER_H + 4
        card_w = SW - 20
        card_h = SH - widgets.HEADER_H - widgets.HINT_H - 8
        d.rect(card_x + 2, card_y + 2, card_w, card_h, theme.MUTED2, fill=True)
        d.rect(card_x,     card_y,     card_w, card_h, theme.CARD,   fill=True)
        d.rect(card_x,     card_y,     card_w, 3,      theme.PRIMARY, fill=True)

        # Pink "+" badge + heading. Slightly smaller (32 vs 36) so it
        # leaves more room for the instruction body below.
        bx, by, bsz = card_x + 10, card_y + 10, 32
        d.rect(bx, by, bsz, bsz, theme.PRIMARY, fill=True)
        d.rect(bx + bsz // 2 - 2, by + 5,            4, bsz - 10, api.WHITE, fill=True)
        d.rect(bx + 5,            by + bsz // 2 - 2, bsz - 10, 4, api.WHITE, fill=True)
        d.text("Add media",       bx + bsz + 10, by + 2,  theme.PRIMARY, scale=2)
        d.text("scroll UP / DOWN", bx + bsz + 10, by + 22, theme.MUTED)

        # Scrollable instructions. Uniform scale=1 across headings,
        # bullets and code so all three feel like one body of text;
        # visual hierarchy comes from colour + a gold underline on
        # headings + tinted background on code, not from font size.
        text_x   = card_x + 12
        inner_w  = card_w - 24
        list_y   = card_y + 10 + bsz + 12
        list_bot = card_y + card_h - 8

        LINE_H  = 12
        ROW_GAP = 6

        max_h_chars = inner_w // 8
        max_b_chars = (inner_w - 12) // 8
        max_c_chars = (inner_w - 12) // 8

        rows = _HELP[self._scroll:]
        cur_y = list_y
        rendered = 0
        for kind, payload in rows:
            if kind == "h":
                lines = _wrap_help(payload, max_h_chars)
                block_h = len(lines) * LINE_H + 4
                if cur_y + block_h > list_bot:
                    break
                if rendered > 0:
                    cur_y += ROW_GAP
                for line in lines:
                    d.text(line, text_x, cur_y, theme.PRIMARY, scale=1)
                    cur_y += LINE_H
                last_w = len(lines[-1]) * 8
                d.rect(text_x, cur_y - 2, last_w, 1, theme.GOLD, fill=True)
            elif kind == "b":
                lines = _wrap_help(payload, max_b_chars)
                block_h = len(lines) * LINE_H + 2
                if cur_y + block_h > list_bot:
                    break
                d.rect(text_x + 2, cur_y + 3, 3, 3, theme.PRIMARY, fill=True)
                for line in lines:
                    d.text(line, text_x + 10, cur_y,
                           theme.TEXT_BRIGHT, scale=1)
                    cur_y += LINE_H
            elif kind == "code":
                truncated = payload[:max_c_chars]
                if cur_y + LINE_H > list_bot:
                    break
                d.rect(text_x + 4, cur_y - 1, inner_w - 8, LINE_H,
                       theme.DOCK_SEL, fill=True)
                d.text(truncated, text_x + 8, cur_y + 1,
                       theme.TEAL, scale=1)
                cur_y += LINE_H + 1
            rendered += 1

        # Scroll indicators — small arrows on the right edge when more
        # content exists above / below the visible window.
        sx = card_x + card_w - 14
        if self._scroll > 0:
            d.text("^", sx, list_y - 12, theme.PRIMARY, scale=2)
        if self._scroll + rendered < len(_HELP):
            d.text("v", sx, list_bot - 12, theme.PRIMARY, scale=2)
