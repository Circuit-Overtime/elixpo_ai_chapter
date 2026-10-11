"""Find one classifier-matching diffusion seed for each requested MNIST digit."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from apps.diffuino.python.classifier import DigitClassifier
from apps.diffuino.python.frame import DIGIT_SIZE, LEFT_MARGIN, state_to_matrix
from apps.diffuino.python.runtime import DiffusionSampler


ROOT = Path(__file__).resolve().parent


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--start", type=int, default=0)
    result.add_argument("--count", type=int, default=20)
    result.add_argument("--threads", type=int, default=4)
    result.add_argument("--model", type=Path, required=True)
    result.add_argument("--classifier", type=Path, default=ROOT / "models" / "mnist_classifier.onnx")
    result.add_argument("--output", type=Path, default=ROOT / "output" / "locked_digit_seeds.png")
    result.add_argument("--json", type=Path, default=ROOT / "output" / "locked_digit_seeds.json")
    return result


def frame_quality(state: np.ndarray) -> tuple[float, float]:
    pixels = np.clip((state.squeeze() + 1.0) * 0.5, 0.0, 1.0)
    return (
        float(np.mean(pixels >= 0.5)),
        float(np.percentile(pixels, 95) - np.percentile(pixels, 5)),
    )


def run(args: argparse.Namespace) -> None:
    sampler = DiffusionSampler(args.model, threads=args.threads)
    classifier = DigitClassifier(args.classifier, threads=args.threads)
    selected: dict[int, dict] = {}
    for requested in range(10):
        candidates = []
        for seed in range(args.start, args.start + args.count):
            state = sampler.sample(1000, seed, "ddpm", label=requested)
            predicted, confidence = classifier.predict(state)
            ink, contrast = frame_quality(state)
            if predicted == requested and 0.025 <= ink <= 0.40 and contrast >= 0.40:
                candidates.append((confidence, seed, ink, contrast, state))
        if candidates:
            confidence, seed, ink, contrast, state = max(candidates, key=lambda item: item[0])
            selected[requested] = {
                "seed": seed,
                "classifier_confidence": confidence,
                "ink_fraction": ink,
                "contrast": contrast,
                "state": state,
            }
            print(
                f"digit={requested} seed={seed} confidence={confidence:.1%} "
                f"ink={ink:.1%} contrast={contrast:.2f}",
                flush=True,
            )
        else:
            print(f"digit={requested} no matching seed", flush=True)

    tile_size, header = 96, 20
    sheet = Image.new("L", (5 * tile_size, 2 * (tile_size + header)), 0)
    draw = ImageDraw.Draw(sheet)
    for requested in range(10):
        x = requested % 5 * tile_size
        y = requested // 5 * (tile_size + header)
        record = selected.get(requested)
        if record is None:
            draw.text((x + 2, y + 2), f"digit {requested}: none", fill=255)
            continue
        frame = state_to_matrix(record["state"], digit=requested)
        pixels = frame[:, LEFT_MARGIN : LEFT_MARGIN + DIGIT_SIZE] * 255 // 7
        image = Image.fromarray(pixels, mode="L").resize(
            (tile_size, tile_size), Image.Resampling.NEAREST
        )
        draw.text((x + 2, y + 2), f"digit {requested}: seed {record['seed']}", fill=255)
        sheet.paste(image, (x, y + header))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)
    serializable = {
        str(digit): {key: value for key, value in record.items() if key != "state"}
        for digit, record in selected.items()
    }
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(serializable, indent=2) + "\n")
    print(f"found={len(selected)}/10 matrix_sheet={args.output} locks={args.json}")


if __name__ == "__main__":
    run(parser().parse_args())
