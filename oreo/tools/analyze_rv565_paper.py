#!/usr/bin/env python3
"""Reproduce the derived RV565 paper analyses from committed measurements.

Every value printed here appears in paper/rv565.tex (Sections 6.3-6.7):
the SPI wire-time bound, the inflate-latency model and its held-out error,
the frame-independence size comparison, and the Gallery stage decomposition.

Runs are selected through a standalone aggregate JSON: its input list names
the per-run records, and its media digest selects the integrated Gallery
record measured with the same container. The script refuses a container
whose SHA-256 differs from that digest.
"""

import argparse
import csv
import hashlib
import json
import statistics
import struct
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MEASUREMENTS = REPO_ROOT / "paper/measurements"
LCD_W, LCD_H, SPI_HZ = 320, 240, 40_000_000


def read_container(path, digest):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit("media does not match the evaluated artifact")
    width, height, fps, _, count = struct.unpack_from("<HHBBH", data, 4)
    sizes, payloads, offset = [], [], 12
    for _ in range(count):
        size = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        sizes.append(size)
        payloads.append(data[offset:offset + size])
        offset += size
    if offset != len(data):
        raise SystemExit("trailing bytes in container")
    return data, width, height, fps, sizes, payloads


def rows(csv_paths):
    found = []
    for path in csv_paths:
        with path.open(newline="") as source:
            found.extend(csv.DictReader(source))
    if not found:
        raise SystemExit("no per-frame records found")
    return found


def latest(pattern):
    matches = sorted(MEASUREMENTS.glob(pattern))
    if not matches:
        raise SystemExit("no measurement matches %s" % pattern)
    return matches[-1]


def select_runs(label):
    aggregate = json.loads(latest(
        "video-benchmark-%s-aggregate-*.json" % label).read_text())
    digest = aggregate["artifacts"]["media"]
    standalone = []
    for name in aggregate["inputs"]:
        record = json.loads((REPO_ROOT / name).read_text())
        standalone.append(MEASUREMENTS / record["frame_csv"])
    gallery = [
        path for path in sorted(MEASUREMENTS.glob(
            "video-benchmark-oreoos-gallery-*.json"))
        if json.loads(path.read_text())["artifacts"]["media"] == digest
    ]
    if not gallery:
        return digest, standalone, []
    gallery_csv = MEASUREMENTS / json.loads(
        gallery[-1].read_text())["frame_csv"]
    return digest, standalone, [gallery_csv]


def fit(xs, ys):
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx
    return slope, my - slope * mx, sxy / (sxx * syy) ** 0.5


def percentile(values, q):
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return (ordered[lower] * (upper - position) +
            ordered[upper] * (position - lower))


def column(table, name):
    return [int(row[name]) for row in table]


def transfer(args, xs, ys, target_rows, sizes, period_us):
    """Fit the inflate model on another window and predict this one."""
    digest, train_csvs, _ = select_runs(args.transfer_from)
    _, _, _, _, train_sizes, _ = read_container(args.transfer_media, digest)
    train = rows(train_csvs)
    tx = [train_sizes[int(row["source_frame"])] for row in train]
    ty = column(train, "inflate_us")
    slope, intercept, _ = fit(tx, ty)
    errors = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    print("\n== Transfer from %s" % args.transfer_from)
    print("model %.3f ms + %.4f us/byte; mean error %.3f ms, MAE %.3f ms, "
          "max %.3f ms" % (intercept / 1e3, slope,
                           statistics.fmean(errors) / 1e3,
                           statistics.fmean(map(abs, errors)) / 1e3,
                           max(map(abs, errors)) / 1e3))
    lcd = statistics.fmean(column(train, "lcd_us"))
    predicted = sum(intercept + slope * size + lcd > period_us
                    for size in sizes)
    late = {}
    for row in target_rows:
        frame = int(row["source_frame"])
        late[frame] = late.get(frame, False) or int(row["work_us"]) > period_us
    print("serial late source frames: predicted %d/%d, measured %d/%d" %
          (predicted, len(sizes), sum(late.values()), len(late)))
    px, py = tx + xs, ty + ys
    slope, intercept, r = fit(px, py)
    residual = [y - (intercept + slope * x) for x, y in zip(px, py)]
    print("pooled %.3f ms + %.4f us/byte, r2=%.4f, MAE %.3f ms, max %.3f ms" %
          (intercept / 1e3, slope, r * r,
           statistics.fmean(map(abs, residual)) / 1e3,
           max(map(abs, residual)) / 1e3))
    print("serial threshold: L <= %.0f bytes" %
          ((period_us - lcd - intercept) / slope))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "media", type=Path, nargs="?",
        default=REPO_ROOT / "experiments/video_dma/main/video.rv565")
    parser.add_argument(
        "--label", default="native-dma-stripes",
        help="standalone aggregate label, e.g. bbb090-serial")
    parser.add_argument(
        "--transfer-from", metavar="LABEL",
        help="serial label whose inflate model predicts this label's runs")
    parser.add_argument(
        "--transfer-media", type=Path,
        help="container measured by --transfer-from")
    args = parser.parse_args()
    if bool(args.transfer_from) != bool(args.transfer_media):
        raise SystemExit("--transfer-from and --transfer-media go together")

    digest, standalone_csvs, gallery_csvs = select_runs(args.label)
    data, width, height, fps, sizes, payloads = read_container(
        args.media, digest)
    frame_bytes = width * height * 2
    frames = [zlib.decompress(payload) for payload in payloads]
    if any(len(frame) != frame_bytes for frame in frames):
        raise SystemExit("frame does not inflate to its RGB565 size")
    period_us = 1_000_000 / fps

    print("== Container")
    raw = 12 + frame_bytes * len(frames)
    print("bytes %d, raw %d, ratio %.3f" % (len(data), raw, raw / len(data)))
    print("payload min %d, mean %.1f, max %d" %
          (min(sizes), statistics.fmean(sizes), max(sizes)))

    standalone = rows(standalone_csvs)
    lcd = column(standalone, "lcd_us")
    wait = column(standalone, "dma_wait_us")
    wire_us = LCD_W * LCD_H * 16 / SPI_HZ * 1e6
    print("\n== Standalone bus bound (%d frames)" % len(standalone))
    print("wire %.2f ms, bound %.2f FPS" % (wire_us / 1e3, 1e6 / wire_us))
    print("lcd mean %.3f ms = %.1f%% of wire efficiency" %
          (statistics.fmean(lcd) / 1e3, 100 * wire_us / statistics.fmean(lcd)))
    print("dma wait %.1f%% of lcd" %
          (100 * statistics.fmean(wait) / statistics.fmean(lcd)))
    print("max work %.3f ms, slack %.3f ms" %
          (max(column(standalone, "work_us")) / 1e3,
           (period_us - max(column(standalone, "work_us"))) / 1e3))

    print("\n== Inflate model")
    xs = [sizes[int(row["source_frame"])] for row in standalone]
    ys = column(standalone, "inflate_us")
    slope, intercept, r = fit(xs, ys)
    print("standalone %.3f ms + %.4f us/byte, r=%.3f, r2=%.3f" %
          (intercept / 1e3, slope, r, r * r))
    train = [(x, y) for x, y, row in zip(xs, ys, standalone)
             if int(row["source_frame"]) % 2 == 0]
    test = [(x, y) for x, y, row in zip(xs, ys, standalone)
            if int(row["source_frame"]) % 2 == 1]
    slope_t, intercept_t, _ = fit(*zip(*train))
    errors = [abs(y - (intercept_t + slope_t * x)) for x, y in test]
    print("even->odd holdout MAE %.3f ms, max %.3f ms" %
          (statistics.fmean(errors) / 1e3, max(errors) / 1e3))
    largest = max(range(len(sizes)), key=sizes.__getitem__)
    observed = max(y for y, row in zip(ys, standalone)
                   if int(row["source_frame"]) == largest)
    print("largest frame %d bytes: predicted %.2f ms, observed max %.2f ms" %
          (sizes[largest], (intercept + slope * sizes[largest]) / 1e3,
           observed / 1e3))

    if args.transfer_from:
        transfer(args, xs, ys, standalone, sizes, period_us)

    print("\n== Frame independence (payload bytes)")
    stream = b"".join(frames)
    shipped = sum(sizes)
    variants = [
        ("independent L1 (shipped)", shipped),
        ("single stream L1", len(zlib.compress(stream, 1))),
        ("independent L6", sum(len(zlib.compress(f, 6)) for f in frames)),
        ("independent L9", sum(len(zlib.compress(f, 9)) for f in frames)),
        ("single stream L9", len(zlib.compress(stream, 9))),
    ]
    xor = len(zlib.compress(frames[0], 1)) + sum(
        len(zlib.compress(bytes(a ^ b for a, b in zip(prev, cur)), 1))
        for prev, cur in zip(frames, frames[1:]))
    variants.append(("XOR previous L1", xor))
    for name, size in variants:
        print("%-26s %9d %.3f" % (name, size, size / shipped))
    reproduced = sum(zlib.compress(f, 1) == p for f, p in zip(frames, payloads))
    print("level-1 payloads reproduced byte for byte: %d/%d" %
          (reproduced, len(frames)))

    if not gallery_csvs:
        print("\n== No Gallery record uses this media; skipping decomposition")
        return
    gallery = rows(gallery_csvs)
    print("\n== Gallery decomposition (%d frames)" % len(gallery))
    overlay = [d - s for d, s in zip(column(gallery, "draw_us"),
                                     column(gallery, "scale_us"))]
    residual = [w - r - i - d - p for w, r, i, d, p in zip(
        column(gallery, "work_us"), column(gallery, "read_us"),
        column(gallery, "inflate_us"), column(gallery, "draw_us"),
        column(gallery, "present_us"))]
    for name, values in (("overlay", overlay), ("residual", residual)):
        print("%-8s mean %.3f p99 %.3f max %.3f ms" %
              (name, statistics.fmean(values) / 1e3,
               percentile(values, 0.99) / 1e3, max(values) / 1e3))
    gx = [sizes[int(row["source_frame"])] for row in gallery]
    for name in ("read_us", "inflate_us"):
        slope, intercept, r = fit(gx, column(gallery, name))
        print("%-10s %.3f ms + %.4f us/byte, r=%.3f" %
              (name, intercept / 1e3, slope, r))
        if name == "read_us":
            print("  raw-frame read projection %.1f ms" %
                  ((intercept + slope * frame_bytes) / 1e3))
    read = statistics.fmean(column(gallery, "read_us"))
    print("read throughput %.3f MB/s, raw-frame proportional projection %.1f ms"
          % (statistics.fmean(gx) / read, read * frame_bytes /
             statistics.fmean(gx) / 1e3))
    print("present over wire %.2f ms" %
          ((statistics.fmean(column(gallery, "present_us")) - wire_us) / 1e3))


if __name__ == "__main__":
    main()
