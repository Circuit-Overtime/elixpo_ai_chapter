"""Screen Diffuino seeds locally before spending time on the UNO Q matrix."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from apps.diffuino.python.classifier import DigitClassifier
from apps.diffuino.python.frame import DIGIT_SIZE, LEFT_MARGIN, state_to_matrix
from apps.diffuino.python.runtime import DiffusionSampler


ROOT = Path(__file__).resolve().parent


def quality(state: np.ndarray) -> tuple[float, float]:
    pixels = np.clip((state.squeeze() + 1.0) * 0.5, 0.0, 1.0)
    ink_fraction = float(np.mean(pixels >= 0.5))
    contrast = float(np.percentile(pixels, 95) - np.percentile(pixels, 5))
    return ink_fraction, contrast


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--start", type=int, default=0)
    result.add_argument("--count", type=int, default=50)
    result.add_argument(
        "--seeds",
        help="comma-separated explicit seeds; overrides --start and --count",
    )
    result.add_argument("--threads", type=int, default=4)
    result.add_argument("--digit", type=int, choices=range(10))
    result.add_argument("--columns", type=int, default=10)
    result.add_argument("--output", type=Path, default=ROOT / "output" / "seed_screen.png")
    result.add_argument(
        "--matrix-output",
        type=Path,
        default=ROOT / "output" / "seed_screen_matrix.png",
    )
    result.add_argument("--csv", type=Path, default=ROOT / "output" / "seed_screen.csv")
    result.add_argument("--model", type=Path, default=ROOT / "models" / "mnist_unconditional_w1a32.onnx")
    result.add_argument("--classifier", type=Path, default=ROOT / "models" / "mnist_classifier.onnx")
    return result


def run(args: argparse.Namespace) -> None:
    sampler = DiffusionSampler(args.model, threads=args.threads)
    classifier = DigitClassifier(args.classifier, threads=args.threads)
    records = []
    images = []
    matrix_images = []
    seeds = (
        [int(value.strip()) for value in args.seeds.split(",") if value.strip()]
        if args.seeds
        else range(args.start, args.start + args.count)
    )
    if not seeds:
        raise SystemExit("no seeds requested")
    for seed in seeds:
        state = sampler.sample(
            sampling_steps=1000,
            seed=seed,
            sampler="ddpm",
            label=args.digit,
        )
        digit, confidence = classifier.predict(state)
        ink_fraction, contrast = quality(state)
        usable = 0.03 <= ink_fraction <= 0.35 and contrast >= 0.45 and confidence >= 0.60
        records.append(
            {
                "seed": seed,
                "digit": digit,
                "confidence": confidence,
                "ink_fraction": ink_fraction,
                "contrast": contrast,
                "usable": usable,
            }
        )
        pixels = np.clip((state.squeeze() + 1.0) * 127.5, 0, 255).astype(np.uint8)
        images.append(Image.fromarray(pixels, mode="L"))
        matrix_pixels = state_to_matrix(
            state,
            digit=args.digit,
        )[:, LEFT_MARGIN : LEFT_MARGIN + DIGIT_SIZE]
        matrix_images.append(Image.fromarray(matrix_pixels * 255 // 7, mode="L"))
        print(
            f"seed={seed:4d} predicted={digit} confidence={confidence:6.1%} "
            f"ink={ink_fraction:5.1%} contrast={contrast:.2f} "
            f"{'KEEP' if usable else 'reject'}",
            flush=True,
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.csv.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)

    tile_width, tile_height = 84, 102
    rows = (len(images) + args.columns - 1) // args.columns
    sheet = Image.new("L", (args.columns * tile_width, rows * tile_height), 0)
    draw = ImageDraw.Draw(sheet)
    for index, (image, record) in enumerate(zip(images, records)):
        x = index % args.columns * tile_width
        y = index // args.columns * tile_height
        sheet.paste(image.resize((tile_width, tile_width), Image.Resampling.NEAREST), (x, y + 18))
        marker = "*" if record["usable"] else "x"
        draw.text((x + 2, y + 2), f"{record['seed']}:{record['digit']} {marker}", fill=255)
    sheet.save(args.output)

    matrix_sheet = Image.new("L", (args.columns * tile_width, rows * tile_height), 0)
    matrix_draw = ImageDraw.Draw(matrix_sheet)
    for index, (image, record) in enumerate(zip(matrix_images, records)):
        x = index % args.columns * tile_width
        y = index // args.columns * tile_height
        matrix_sheet.paste(
            image.resize((tile_width, tile_width), Image.Resampling.NEAREST),
            (x, y + 18),
        )
        matrix_draw.text(
            (x + 2, y + 2),
            f"{record['seed']}:{record['digit']}",
            fill=255,
        )
    args.matrix_output.parent.mkdir(parents=True, exist_ok=True)
    matrix_sheet.save(args.matrix_output)

    print("\nBest usable seed per predicted digit:")
    for digit in range(10):
        candidates = [row for row in records if row["digit"] == digit and row["usable"]]
        if candidates:
            best = max(candidates, key=lambda row: row["confidence"])
            print(f"digit={digit} seed={best['seed']} confidence={best['confidence']:.1%}")
        else:
            print(f"digit={digit} no usable seed in range")
    print(f"contact_sheet={args.output}")
    print(f"matrix_sheet={args.matrix_output}")
    print(f"metrics={args.csv}")


if __name__ == "__main__":
    run(parser().parse_args())
