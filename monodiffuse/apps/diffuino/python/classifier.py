"""Name a generated MNIST sample using the paper's held-out evaluator."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort


class DigitClassifier:
    def __init__(self, model_path: Path, threads: int = 4):
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(
            str(model_path), options, providers=["CPUExecutionProvider"]
        )

    def predict(self, state: np.ndarray) -> tuple[int, float]:
        image = np.asarray(state, dtype=np.float32)
        if image.shape != (1, 1, 28, 28):
            raise ValueError(f"expected shape (1, 1, 28, 28), received {image.shape}")
        logits = self.session.run(None, {"image": image})[0][0]
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        digit = int(probabilities.argmax())
        return digit, float(probabilities[digit])
