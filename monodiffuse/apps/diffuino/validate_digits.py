"""Render requested classes through the exact Diffuino 8x8 display path."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from apps.diffuino.python.classifier import DigitClassifier
from apps.diffuino.python.frame import DIGIT_SIZE, LEFT_MARGIN, state_to_matrix
from apps.diffuino.python.runtime import DiffusionSampler


ROOT = Path(__file__).resolve().parent


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--seed", type=int, default=11)
    result.add_argument("--threads", type=int, default=4)
    result.add_argument("--sampler", choices=("ddpm", "ddim"), default="ddpm")
    result.add_argument("--steps", type=int, default=1000)
    result.add_argument("--model", type=Path, default=ROOT / "models" / "mnist_conditional_w1a32.onnx")
    result.add_argument("--classifier", type=Path, default=ROOT / "models" / "mnist_classifier.onnx")
    result.add_argument("--output", type=Path, default=ROOT / "output" / "conditional_digits_matrix.png")
    return result


def run(args: argparse.Namespace) -> None:
    sampler = DiffusionSampler(args.model, threads=args.threads)
    classifier = DigitClassifier(args.classifier, threads=args.threads)
    tile_size, header = 96, 20
    sheet = Image.new("L", (5 * tile_size, 2 * (tile_size + header)), 0)
    draw = ImageDraw.Draw(sheet)
    matches = 0
    for requested in range(10):
        state = sampler.sample(args.steps, args.seed, args.sampler, label=requested)
        predicted, confidence = classifier.predict(state)
        matches += predicted == requested
        frame = state_to_matrix(state, digit=requested)
        pixels = frame[:, LEFT_MARGIN : LEFT_MARGIN + DIGIT_SIZE] * 255 // 7
        image = Image.fromarray(pixels, mode="L").resize(
            (tile_size, tile_size), Image.Resampling.NEAREST
        )
        x = requested % 5 * tile_size
        y = requested // 5 * (tile_size + header)
        draw.text((x + 2, y + 2), f"req {requested} pred {predicted}", fill=255)
        sheet.paste(image, (x, y + header))
        print(
            f"requested={requested} predicted={predicted} "
            f"confidence={confidence:.1%} match={'yes' if predicted == requested else 'no'}",
            flush=True,
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)
    print(f"matches={matches}/10 matrix_sheet={args.output}")


if __name__ == "__main__":
    run(parser().parse_args())
