"""Encode a host video as a native-accelerated Oreo Gallery stream.

RV565 v4 stores each frame as a 256-entry RGB565 palette followed by 8-bit
indices. The badge reads about 30 KB per frame and its Gallery-local C module
expands 200x150 to the 320x240 framebuffer in about 8 ms. There is no inflate
stall and only one compact frame is kept in RAM.

Usage:
    python3 tools/encode_gallery_video.py spiderman.mp4 \
        apps/gallery/assets/optimized/spiderman.rv565 --seconds 10 --fps 24
"""

import argparse
import shutil
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image


W = 180
H = 135


def _rgb565_palette(palette):
    """Convert Pillow's 256xRGB palette to panel-order RGB565 bytes."""
    out = bytearray(512)
    # Pillow normally returns all 768 bytes, but pad defensively for images
    # whose quantizer found fewer than 256 colours.
    palette = list(palette or ())
    if len(palette) < 768:
        palette.extend([0] * (768 - len(palette)))
    for i in range(256):
        r, g, b = palette[i * 3:i * 3 + 3]
        value = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        out[i * 2] = value >> 8
        out[i * 2 + 1] = value & 0xff
    return out


def encode(source: Path, output: Path, seconds: float, fps: int):
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    if not source.is_file():
        raise SystemExit("source not found: %s" % source)
    if fps < 1 or fps > 30:
        raise SystemExit("fps must be between 1 and 30")

    frame_bytes = W * H * 3
    vf = ("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase,"
          "crop=%d:%d" % (fps, W, H, W, H))
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(source),
        "-t", str(seconds), "-an", "-vf", vf,
        "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
    ]

    output.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frames = 0
    try:
        with output.open("wb+") as out:
            out.write(b"RV5\x04" + struct.pack("<HHBBH", W, H, fps, 0, 0))
            while True:
                frame = proc.stdout.read(frame_bytes)
                if not frame:
                    break
                if len(frame) != frame_bytes:
                    raise RuntimeError("ffmpeg returned a partial frame")
                image = Image.frombytes("RGB", (W, H), frame)
                indexed = image.quantize(
                    colors=256,
                    method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE,
                )
                out.write(_rgb565_palette(indexed.getpalette()))
                out.write(indexed.tobytes())
                frames += 1
            out.seek(10)
            out.write(struct.pack("<H", frames))
    except Exception:
        try:
            output.unlink()
        except OSError:
            pass
        proc.kill()
        raise
    finally:
        if proc.stdout:
            proc.stdout.close()

    rc = proc.wait()
    if rc != 0 or frames == 0:
        try:
            output.unlink()
        except OSError:
            pass
        raise SystemExit("ffmpeg failed (rc=%d, frames=%d)" % (rc, frames))

    size_mb = output.stat().st_size / (1024 * 1024)
    print("Encoded %d frames at %d FPS: %.2f MB -> %s" %
          (frames, fps, size_mb, output))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=24)
    args = parser.parse_args()
    encode(args.source, args.output, args.seconds, args.fps)


if __name__ == "__main__":
    main()
