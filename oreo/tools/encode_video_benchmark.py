"""Encode a high-quality RGB565 stream for the standalone DMA benchmark.

The default output is RV565 v6: the existing 12-byte RV5 header followed by
independently zlib-compressed frames (u32 little-endian size + payload). Each
frame expands to RGB565 big-endian pixels. Independent frames keep seeking,
looping and SD-card streaming deterministic. ``--raw`` emits the proven v5
baseline instead.
"""

import argparse
import shutil
import struct
import subprocess
import zlib
from pathlib import Path


def _read_exact(stream, size):
    data = bytearray(size)
    view = memoryview(data)
    offset = 0
    while offset < size:
        chunk = stream.read(size - offset)
        if not chunk:
            return None if offset == 0 else bytes(view[:offset])
        view[offset:offset + len(chunk)] = chunk
        offset += len(chunk)
    return data


def encode(source, output, seconds, fps, width, height, compressed=True):
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    if not source.is_file():
        raise SystemExit("source not found: %s" % source)
    if not 1 <= fps <= 30:
        raise SystemExit("fps must be between 1 and 30")
    if width <= 0 or height <= 0 or width > 320 or height > 240:
        raise SystemExit("dimensions must fit inside 320x240")

    frame_size = width * height * 2
    vf = ("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase:"
          "flags=lanczos,crop=%d:%d,format=rgb565be" %
          (fps, width, height, width, height))
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(source), "-t", str(seconds),
        "-an", "-vf", vf, "-pix_fmt", "rgb565be", "-f", "rawvideo", "-",
    ]

    output.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frames = 0
    try:
        with output.open("wb+") as out:
            version = 6 if compressed else 5
            out.write(b"RV5" + bytes((version,)) +
                      struct.pack("<HHBBH", width, height, fps, 0, 0))
            while True:
                frame = _read_exact(proc.stdout, frame_size)
                if frame is None:
                    break
                if len(frame) != frame_size:
                    raise RuntimeError("ffmpeg returned a partial frame")
                if compressed:
                    packed = zlib.compress(frame, 1)
                    out.write(struct.pack("<I", len(packed)))
                    out.write(packed)
                else:
                    out.write(frame)
                frames += 1
            if frames > 0xffff:
                raise RuntimeError("RV565 frame count exceeds 65535")
            out.seek(10)
            out.write(struct.pack("<H", frames))
    except Exception:
        proc.kill()
        try:
            output.unlink()
        except OSError:
            pass
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

    mib = output.stat().st_size / (1024 * 1024)
    print("Encoded RV565 v%d: %d frames, %dx%d RGB565, %d FPS: %.2f MiB -> %s" %
          (6 if compressed else 5, frames, width, height, fps, mib, output))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "output", type=Path, nargs="?",
        default=Path("experiments/video_dma/main/video.rv565"),
    )
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=180)
    parser.add_argument("--height", type=int, default=135)
    parser.add_argument("--raw", action="store_true",
                        help="emit uncompressed RV565 v5 baseline")
    args = parser.parse_args()
    encode(args.source, args.output, args.seconds, args.fps,
           args.width, args.height, not args.raw)


if __name__ == "__main__":
    main()
