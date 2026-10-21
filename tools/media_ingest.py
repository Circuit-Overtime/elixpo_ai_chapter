#!/usr/bin/env python3
"""Prepare and optionally transfer media into OreoOS.

Every path follows the same contract: detect -> convert -> validate the final
artifact -> check storage -> transfer. Source size is never used as a proxy for
stored size.

Examples:
  python3 tools/media_ingest.py photo.jpg
  python3 tools/media_ingest.py clip.mp4 --seconds 10 --to-board
  python3 tools/media_ingest.py notes.md --to-board --port /dev/ttyACM0
"""

import argparse
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "dist" / "media"
DEFAULT_MEDIA_BUDGET = 5 * 1024 * 1024
DEFAULT_RESERVE = 256 * 1024
PHOTO_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
DOC_EXTS = {".md", ".txt"}


def human(size):
    return "%.2f MiB" % (size / (1024 * 1024)) if size >= 1024 * 1024 else "%.1f KiB" % (size / 1024)


def safe_stem(path):
    out = "".join(c if c.isalnum() or c in "-_" else "-" for c in path.stem)
    return out.strip("-")[:48] or "media"


def detect(path, forced=None):
    if forced:
        return forced
    ext = path.suffix.lower()
    if ext in PHOTO_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in DOC_EXTS:
        return "document"
    raise SystemExit("unsupported input type: %s" % ext)


def encode_image(source, output, max_dim):
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("Pillow is required for images: pip install Pillow")
    with Image.open(source) as image:
        image = image.convert("RGB")
        scale = min(1.0, max_dim / max(image.size))
        size = (max(1, round(image.width * scale)),
                max(1, round(image.height * scale)))
        if size != image.size:
            image = image.resize(size, Image.Resampling.LANCZOS)
        raw = bytearray(image.width * image.height * 2)
        pos = 0
        for red, green, blue in image.getdata():
            pixel = ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)
            raw[pos] = pixel >> 8
            raw[pos + 1] = pixel & 0xFF
            pos += 2
    packed = zlib.compress(raw, 6)
    output.write_bytes(b"R5Z\x01" + struct.pack("<HHI", image.width, image.height,
                                                len(raw)) + packed)


def encode_document(source, output):
    raw = source.read_bytes()
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit("documents must be UTF-8: %s" % exc)
    output.write_bytes(b"ODZ\x01" + struct.pack("<I", len(raw)) +
                       zlib.compress(raw, 9))


def encode_video(source, output, seconds, fps, width, height):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from encode_video_benchmark import encode
    encode(source, output, seconds, fps, width, height, compressed=True)


def validate(path, kind):
    size = path.stat().st_size
    with path.open("rb") as stream:
        head = stream.read(12)
        if kind == "image":
            if len(head) != 12 or head[:4] != b"R5Z\x01":
                raise SystemExit("invalid compressed image")
            width, height, raw_len = struct.unpack("<HHI", head[4:12])
            if not (0 < width <= 320 and 0 < height <= 240 and
                    raw_len == width * height * 2):
                raise SystemExit("invalid compressed image dimensions")
            if len(zlib.decompress(stream.read())) != raw_len:
                raise SystemExit("compressed image payload is truncated")
        elif kind == "document":
            if len(head) < 8 or head[:4] != b"ODZ\x01":
                raise SystemExit("invalid compressed document")
            raw_len = struct.unpack("<I", head[4:8])[0]
            if len(zlib.decompress(head[8:] + stream.read())) != raw_len:
                raise SystemExit("compressed document payload is truncated")
        else:
            if len(head) != 12 or head[:4] != b"RV5\x06":
                raise SystemExit("invalid RV565 v6 video")
            width, height, fps, _, frames = struct.unpack("<HHBBH", head[4:])
            if not (0 < width <= 320 and 0 < height <= 240 and
                    0 < fps <= 30 and frames > 0):
                raise SystemExit("invalid RV565 v6 metadata")
            raw_len = width * height * 2
            for index in range(frames):
                packed_head = stream.read(4)
                if len(packed_head) != 4:
                    raise SystemExit("video frame %d is truncated" % index)
                packed_len = struct.unpack("<I", packed_head)[0]
                decoded = zlib.decompress(stream.read(packed_len))
                if len(decoded) != raw_len:
                    raise SystemExit("video frame %d has the wrong size" % index)
            if stream.read(1):
                raise SystemExit("video contains trailing data")
    return size


def board_free(port):
    code = "import os;s=os.statvfs('/');print('FREE=%d' % (s[1]*s[4]))"
    result = subprocess.run([sys.executable, "-m", "mpremote", "connect", port,
                             "exec", code], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("cannot query badge storage:\n%s" %
                         (result.stderr or result.stdout).strip())
    for line in result.stdout.splitlines():
        if line.startswith("FREE="):
            return int(line[5:])
    raise SystemExit("badge did not report free storage")


def transfer(path, kind, port):
    base = "apps/gallery/assets/optimized" if kind in ("image", "video") else "documents"
    remote = base + "/" + path.name
    mkdir = ("import os\n"
             "p='%s';c=''\n"
             "for x in p.split('/'):\n"
             " c=(c+'/'+x) if c else x\n"
             " try: os.mkdir(c)\n"
             " except OSError: pass" % base)
    subprocess.run([sys.executable, "-m", "mpremote", "connect", port,
                    "exec", mkdir], check=True)
    subprocess.run([sys.executable, "-m", "mpremote", "connect", port,
                    "fs", "cp", str(path), ":" + remote], check=True)
    return remote


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--kind", choices=("image", "video", "document"))
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--to-board", action="store_true")
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--media-budget", type=int, default=DEFAULT_MEDIA_BUDGET)
    parser.add_argument("--reserve", type=int, default=DEFAULT_RESERVE)
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=180)
    parser.add_argument("--height", type=int, default=135)
    parser.add_argument("--photo-max", type=int, default=240)
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_file():
        raise SystemExit("source not found: %s" % source)
    kind = detect(source, args.kind)
    suffix = ".rv565" if kind == "video" else (".rz565" if kind == "image" else source.suffix.lower() + "z")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    final = args.output_dir / (safe_stem(source) + suffix)

    with tempfile.TemporaryDirectory(prefix="oreo-media-") as temp:
        staged = Path(temp) / final.name
        if kind == "video":
            encode_video(source, staged, args.seconds, args.fps,
                         args.width, args.height)
        elif kind == "image":
            encode_image(source, staged, args.photo_max)
        else:
            encode_document(source, staged)
        stored = validate(staged, kind)
        usable = args.media_budget - args.reserve
        if stored > usable:
            raise SystemExit("prepared %s needs %s; media budget after reserve is %s" %
                             (kind, human(stored), human(max(0, usable))))
        if args.to_board:
            free = board_free(args.port)
            if stored + args.reserve > free:
                raise SystemExit("badge has %s free; %s plus %s reserve will not fit" %
                                 (human(free), human(stored), human(args.reserve)))
        shutil.move(str(staged), final)

    ratio = final.stat().st_size / source.stat().st_size if source.stat().st_size else 0
    print("prepared: %s" % final)
    print("source: %s  stored: %s  ratio: %.1f%%" %
          (human(source.stat().st_size), human(final.stat().st_size), ratio * 100))
    if args.to_board:
        remote = transfer(final, kind, args.port)
        print("transferred: %s -> :%s" % (final.name, remote))


if __name__ == "__main__":
    main()
