"""Convert square grayscale diffusion states to UNO Q matrix frames."""

from __future__ import annotations

import numpy as np
from PIL import Image


ROWS = 8
COLS = 13
DIGIT_SIZE = 8
LEFT_MARGIN = (COLS - DIGIT_SIZE) // 2
CRISP_DIGITS = frozenset({2, 3, 8})


def state_to_matrix(
    state: np.ndarray,
    levels: int = 8,
    auto_contrast: bool = True,
    digit: int | None = None,
) -> np.ndarray:
    """Return an 8x13 uint8 frame while preserving MNIST's square aspect ratio."""
    if levels < 2 or levels > 256:
        raise ValueError("levels must be between 2 and 256")
    image = np.asarray(state, dtype=np.float32).squeeze()
    if image.shape != (28, 28):
        raise ValueError(f"expected a 28x28 state, received {image.shape}")
    pixels = np.clip((image + 1.0) * 127.5, 0, 255).astype(np.uint8)
    resized = np.asarray(
        Image.fromarray(pixels, mode="L").resize(
            (DIGIT_SIZE, DIGIT_SIZE),
            (
                Image.Resampling.NEAREST
                if digit in CRISP_DIGITS
                else Image.Resampling.BILINEAR
            ),
        ),
        dtype=np.float32,
    )
    if auto_contrast:
        low, high = np.percentile(resized, (10, 99))
        if high - low >= 1.0:
            resized = np.clip((resized - low) * (255.0 / (high - low)), 0, 255)
    quantized = np.rint(resized * (levels - 1) / 255.0).astype(np.uint8)
    frame = np.zeros((ROWS, COLS), dtype=np.uint8)
    frame[:, LEFT_MARGIN : LEFT_MARGIN + DIGIT_SIZE] = quantized
    return frame


def board_bytes(frame: np.ndarray) -> bytes:
    array = np.asarray(frame, dtype=np.uint8)
    if array.shape != (ROWS, COLS):
        raise ValueError(f"expected an {ROWS}x{COLS} frame, received {array.shape}")
    return array.reshape(-1).tobytes()
