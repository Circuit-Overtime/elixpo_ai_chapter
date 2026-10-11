"""NumPy/ONNX Runtime DDIM sampler for the Arduino UNO Q."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import onnxruntime as ort


FrameCallback = Callable[[int, int, np.ndarray], None]


class DiffusionSampler:
    def __init__(self, model_path: Path, diffusion_steps: int = 1000, threads: int = 4):
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(
            str(model_path), options, providers=["CPUExecutionProvider"]
        )
        self.conditional = any(value.name == "label" for value in self.session.get_inputs())
        self.diffusion_steps = diffusion_steps
        betas = np.linspace(1e-4, 0.02, diffusion_steps, dtype=np.float32)
        self.alpha_bars = np.cumprod(1.0 - betas, dtype=np.float32)

    def sample(
        self,
        sampling_steps: int,
        seed: int,
        sampler: str = "ddpm",
        callback: FrameCallback | None = None,
        frame_every: int = 1,
        label: int | None = None,
    ) -> np.ndarray:
        if not 2 <= sampling_steps <= self.diffusion_steps:
            raise ValueError(f"sampling_steps must be in 2..{self.diffusion_steps}")
        if frame_every < 1:
            raise ValueError("frame_every must be positive")
        if sampler not in {"ddpm", "ddim"}:
            raise ValueError("sampler must be 'ddpm' or 'ddim'")
        if sampler == "ddpm" and sampling_steps != self.diffusion_steps:
            raise ValueError(
                f"DDPM requires exactly {self.diffusion_steps} steps; use DDIM for fewer steps"
            )
        if self.conditional and (label is None or not 0 <= label <= 9):
            raise ValueError("conditional model requires label in 0..9")

        rng = np.random.default_rng(seed)
        state = rng.standard_normal((1, 1, 28, 28), dtype=np.float32)
        schedule = (
            np.arange(self.diffusion_steps - 1, -1, -1, dtype=np.int64)
            if sampler == "ddpm"
            else np.linspace(self.diffusion_steps - 1, 0, sampling_steps, dtype=np.int64)
        )
        betas = np.linspace(1e-4, 0.02, self.diffusion_steps, dtype=np.float32)
        alphas = 1.0 - betas
        alpha_bars_previous = np.concatenate(
            (np.ones(1, dtype=np.float32), self.alpha_bars[:-1])
        )
        posterior_variance = betas * (1.0 - alpha_bars_previous) / (1.0 - self.alpha_bars)

        if callback is not None:
            callback(0, int(schedule[0]), np.clip(state, -1, 1))

        for position, timestep in enumerate(schedule):
            time_input = np.asarray([timestep], dtype=np.int64)
            inputs = {"image": state, "timestep": time_input}
            if self.conditional:
                inputs["label"] = np.asarray([label], dtype=np.int64)
            predicted_noise = self.session.run(None, inputs)[0]
            alpha_bar = self.alpha_bars[timestep]
            predicted_clean = (
                state - np.sqrt(1.0 - alpha_bar) * predicted_noise
            ) / np.sqrt(alpha_bar)

            if sampler == "ddpm":
                mean = state / np.sqrt(alphas[timestep]) - (
                    betas[timestep]
                    / (np.sqrt(alphas[timestep]) * np.sqrt(1.0 - alpha_bar))
                ) * predicted_noise
                if timestep:
                    state = mean + np.sqrt(posterior_variance[timestep]) * rng.standard_normal(
                        state.shape, dtype=np.float32
                    )
                else:
                    state = mean
            elif position == len(schedule) - 1:
                state = predicted_clean
            else:
                next_alpha_bar = self.alpha_bars[schedule[position + 1]]
                state = (
                    np.sqrt(next_alpha_bar) * predicted_clean
                    + np.sqrt(1.0 - next_alpha_bar) * predicted_noise
                ).astype(np.float32, copy=False)

            should_emit = (
                position % frame_every == 0 or position == len(schedule) - 1
            )
            if callback is not None and should_emit:
                callback(position + 1, int(timestep), np.clip(predicted_clean, -1, 1))

        return np.clip(state, -1, 1)
