"""Generate a requested MNIST digit and stream denoising frames to UNO Q."""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from .classifier import DigitClassifier
    from .frame import board_bytes, state_to_matrix
    from .presets import FP32_DIGIT_SEEDS
    from .runtime import DiffusionSampler
except ImportError:  # App Lab executes python/main.py as a script.
    from classifier import DigitClassifier
    from frame import board_bytes, state_to_matrix
    from presets import FP32_DIGIT_SEEDS
    from runtime import DiffusionSampler


ROOT = Path(__file__).resolve().parents[1]


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--sampler", choices=("ddpm", "ddim"), default="ddpm")
    result.add_argument("--steps", type=int, default=1000, help="DDPM requires 1000; DDIM may use fewer")
    result.add_argument(
        "--seed",
        type=int,
        help="initial-noise seed; omitted uses the visually audited seed for --digit",
    )
    result.add_argument(
        "--digit",
        type=int,
        choices=range(10),
        help="generate one requested class and exit; omitted runs the BCD selector service",
    )
    result.add_argument("--threads", type=int, default=4)
    result.add_argument("--frame-every", type=int, default=20)
    result.add_argument("--frame-delay", type=float, default=0.0)
    result.add_argument(
        "--result-hold",
        type=float,
        default=1.2,
        help="cooldown before the reset button is accepted",
    )
    result.add_argument(
        "--poll-interval",
        type=float,
        default=0.05,
        help="seconds between BCD request polls while idle",
    )
    result.add_argument("--brightness-levels", type=int, default=8)
    result.add_argument("--no-matrix", action="store_true")
    result.add_argument(
        "--no-status-leds",
        action="store_true",
        help="disable the four RGB load/progress indicators",
    )
    result.add_argument(
        "--model",
        type=Path,
        default=ROOT / "models" / "mnist_conditional_fp32.onnx",
    )
    result.add_argument(
        "--classifier",
        type=Path,
        default=ROOT / "models" / "mnist_classifier.onnx",
    )
    result.add_argument("--output", type=Path, default=ROOT / "output" / "latest.png")
    return result


def save_image(state: np.ndarray, path: Path) -> None:
    pixels = np.clip((state.squeeze() + 1.0) * 127.5, 0, 255).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, mode="L").save(path)


def generate_digit(
    args: argparse.Namespace,
    sampler: DiffusionSampler,
    classifier: DigitClassifier,
    digit: int,
    display=None,
) -> bool:
    requested_digit = digit
    seed = args.seed if args.seed is not None else FP32_DIGIT_SEEDS[digit]
    emitted = 0
    started = time.perf_counter()

    def generate(status=None):
        nonlocal emitted

        def on_frame(position: int, timestep: int, state: np.ndarray) -> None:
            nonlocal emitted
            frame = state_to_matrix(
                state,
                levels=args.brightness_levels,
                digit=digit,
            )
            if display is not None:
                display.draw(board_bytes(frame))
            loads = status.update(position, args.steps) if status is not None else None
            emitted += 1
            message = f"frame={emitted:03d} step={position:03d}/{args.steps} t={timestep:03d}"
            if loads is not None:
                message += f" cpu={loads[0]:.0%} ram={loads[1]:.0%}"
            print(message, flush=True)
            if args.frame_delay:
                time.sleep(args.frame_delay)

        return sampler.sample(
            sampling_steps=args.steps,
            seed=seed,
            sampler=args.sampler,
            callback=on_frame,
            frame_every=args.frame_every,
            label=digit,
        )

    if display is None:
        final = generate()
        generated_digit, confidence = classifier.predict(final)
    else:
        try:
            from .status import StatusLeds
        except ImportError:
            from status import StatusLeds

        with StatusLeds(display, enabled=not args.no_status_leds) as status:
            final = generate(status)
            generated_digit, confidence = classifier.predict(final)
            status.finish(generated_digit == requested_digit)

    elapsed = time.perf_counter() - started
    save_image(final, args.output)
    print(
        f"done seed={seed} sampler={args.sampler} steps={args.steps} "
        f"frames={emitted} seconds={elapsed:.3f} output={args.output}",
        flush=True,
    )
    print(
        f"requested_digit={requested_digit} generated_digit={generated_digit} "
        f"classifier_confidence={confidence:.1%} "
        f"match={'yes' if generated_digit == requested_digit else 'no'}",
        flush=True,
    )
    return generated_digit == requested_digit


def run_selector_service(
    args: argparse.Namespace,
    sampler: DiffusionSampler,
    classifier: DigitClassifier,
) -> None:
    try:
        from .display import MatrixDisplay
    except ImportError:
        from display import MatrixDisplay

    with MatrixDisplay() as display:
        display.selector_ready()
        print(
            "selector=ready bcd_pins=2,3,4,5 trigger_pin=6 reset_pin=7 "
            "bit_order=lsb_to_msb",
            flush=True,
        )
        while True:
            selected = display.poll_digit()
            if selected < 0:
                time.sleep(args.poll_interval)
                continue

            print(f"bcd_selected={selected}", flush=True)
            success = False
            try:
                if selected <= 9:
                    success = generate_digit(
                        args, sampler, classifier, selected, display
                    )
                else:
                    display.set_led4_color(True, False, False)
                    print(
                        f"bcd_rejected={selected} reason=outside_decimal_range",
                        flush=True,
                    )
            except Exception as error:
                display.set_led4_color(True, False, False)
                print(
                    f"request_failed digit={selected} error={error}",
                    flush=True,
                )
            time.sleep(args.result_hold)
            display.complete_request(success)
            print("selector=locked_waiting_reset reset_pin=7", flush=True)


def run(args: argparse.Namespace) -> None:
    if not args.model.exists():
        raise SystemExit(f"model not found: {args.model}; pull or export it first")
    if not args.classifier.exists():
        raise SystemExit(f"classifier not found: {args.classifier}; pull or export it first")
    if args.result_hold < 0:
        raise SystemExit("--result-hold must not be negative")
    if args.poll_interval <= 0:
        raise SystemExit("--poll-interval must be positive")

    sampler = DiffusionSampler(args.model, threads=args.threads)
    classifier = DigitClassifier(args.classifier, threads=args.threads)

    if args.digit is None:
        if args.no_matrix:
            raise SystemExit("--digit is required with --no-matrix")
        run_selector_service(args, sampler, classifier)
        return

    if args.no_matrix:
        generate_digit(args, sampler, classifier, args.digit)
        return

    try:
        from .display import MatrixDisplay
    except ImportError:
        from display import MatrixDisplay
    with MatrixDisplay() as display:
        generate_digit(args, sampler, classifier, args.digit, display)


if __name__ == "__main__":
    run(parser().parse_args())
