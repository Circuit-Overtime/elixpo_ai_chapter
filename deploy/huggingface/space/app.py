from __future__ import annotations

import os
import time
from functools import lru_cache

import gradio as gr
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image


MODEL_REPO = os.getenv("MODEL_REPO", "elixpo/monodiffuse-mnist-diffusion")
MODEL_DIR = os.getenv("MODEL_DIR")
DIFFUSION_STEPS = 1000
FP32_DIGIT_SEEDS = {0: 15, 1: 16, 2: 50, 3: 22, 4: 0, 5: 0, 6: 12, 7: 4, 8: 10, 9: 18}
MODEL_FILES = {
    "FP32 deployment": "mnist_conditional_fp32.onnx",
    "Native W1A32 (experimental)": "mnist_conditional_w1a32.onnx",
}


def session_options() -> ort.SessionOptions:
    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, min(4, os.cpu_count() or 1))
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return options


@lru_cache(maxsize=3)
def load_session(filename: str) -> ort.InferenceSession:
    path = os.path.join(MODEL_DIR, filename) if MODEL_DIR else hf_hub_download(
        repo_id=MODEL_REPO, filename=filename
    )
    return ort.InferenceSession(path, session_options(), providers=["CPUExecutionProvider"])


def display_image(state: np.ndarray, scale: int = 12) -> Image.Image:
    pixels = np.clip((state.squeeze() + 1.0) * 127.5, 0, 255).astype(np.uint8)
    image = Image.fromarray(pixels, mode="L")
    return image.resize((28 * scale, 28 * scale), Image.Resampling.NEAREST).convert("RGB")


def classifier_prediction(state: np.ndarray) -> tuple[int, float]:
    session = load_session("mnist_classifier.onnx")
    logits = session.run(None, {"image": np.asarray(state, dtype=np.float32)})[0][0]
    probabilities = np.exp(logits - logits.max())
    probabilities /= probabilities.sum()
    digit = int(probabilities.argmax())
    return digit, float(probabilities[digit])


def sampling_plan(mode: str) -> tuple[str, np.ndarray]:
    if mode == "Full DDPM · 1000 steps":
        return "ddpm", np.arange(DIFFUSION_STEPS - 1, -1, -1, dtype=np.int64)
    steps = int(mode.split("·", 1)[1].split()[0])
    return "ddim", np.linspace(DIFFUSION_STEPS - 1, 0, steps, dtype=np.int64)


def generate(digit: int, model_name: str, mode: str, seed: int, curated_seed: bool):
    digit = int(digit)
    seed = FP32_DIGIT_SEEDS[digit] if curated_seed and model_name == "FP32 deployment" else int(seed)
    sampler, schedule = sampling_plan(mode)
    session = load_session(MODEL_FILES[model_name])

    betas = np.linspace(1e-4, 0.02, DIFFUSION_STEPS, dtype=np.float32)
    alphas = 1.0 - betas
    alpha_bars = np.cumprod(alphas, dtype=np.float32)
    previous = np.concatenate((np.ones(1, dtype=np.float32), alpha_bars[:-1]))
    posterior_variance = betas * (1.0 - previous) / (1.0 - alpha_bars)

    rng = np.random.default_rng(seed)
    state = rng.standard_normal((1, 1, 28, 28), dtype=np.float32)
    emit_every = max(1, len(schedule) // 40)
    started = time.perf_counter()

    yield display_image(np.clip(state, -1, 1)), (
        f"### Noise initialized\nDigit **{digit}** · seed **{seed}** · {model_name}"
    )

    for position, timestep_value in enumerate(schedule):
        timestep = int(timestep_value)
        inputs = {
            "image": state,
            "timestep": np.asarray([timestep], dtype=np.int64),
            "label": np.asarray([digit], dtype=np.int64),
        }
        predicted_noise = session.run(None, inputs)[0]
        alpha_bar = alpha_bars[timestep]
        predicted_clean = (
            state - np.sqrt(1.0 - alpha_bar) * predicted_noise
        ) / np.sqrt(alpha_bar)

        if sampler == "ddpm":
            mean = state / np.sqrt(alphas[timestep]) - (
                betas[timestep]
                / (np.sqrt(alphas[timestep]) * np.sqrt(1.0 - alpha_bar))
            ) * predicted_noise
            if timestep:
                noise = rng.standard_normal(state.shape, dtype=np.float32)
                state = mean + np.sqrt(posterior_variance[timestep]) * noise
            else:
                state = mean
        elif position == len(schedule) - 1:
            state = predicted_clean
        else:
            next_alpha_bar = alpha_bars[int(schedule[position + 1])]
            state = (
                np.sqrt(next_alpha_bar) * predicted_clean
                + np.sqrt(1.0 - next_alpha_bar) * predicted_noise
            ).astype(np.float32, copy=False)

        completed = position + 1
        if completed % emit_every == 0 or completed == len(schedule):
            elapsed = time.perf_counter() - started
            percent = 100.0 * completed / len(schedule)
            yield display_image(np.clip(predicted_clean, -1, 1)), (
                f"### Denoising · {percent:.0f}%\n"
                f"Step **{completed}/{len(schedule)}** · diffusion timestep **{timestep}** · "
                f"elapsed **{elapsed:.1f}s**"
            )

    state = np.clip(state, -1, 1).astype(np.float32, copy=False)
    predicted_digit, confidence = classifier_prediction(state)
    elapsed = time.perf_counter() - started
    match = predicted_digit == digit
    badge = "✅ match" if match else "⚠️ mismatch"
    yield display_image(state), (
        f"### Complete · {badge}\nRequested **{digit}** · evaluator prediction "
        f"**{predicted_digit}** · confidence **{confidence:.1%}** · seed **{seed}** · "
        f"**{elapsed:.1f}s**"
    )


CSS = """
.gradio-container {max-width: 1100px !important; margin: auto !important;}
#hero {text-align:center; padding: 12px 0 2px;}
#hero h1 {font-size: clamp(2.2rem, 6vw, 4.7rem); margin-bottom: .15em;
  background: linear-gradient(90deg,#7c3aed,#22d3ee); -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;}
#stage {border: 1px solid rgba(124,58,237,.35); border-radius: 24px;
  box-shadow: 0 20px 80px rgba(76,29,149,.16); overflow:hidden;}
#status {min-height: 92px; padding: 8px 14px;}
"""


with gr.Blocks() as demo:
    gr.HTML(
        "<div id='hero'><h1>Diffuino Live</h1>"
        "<p>Watch noise become a digit—one denoising trajectory at a time.</p></div>"
    )
    with gr.Row(equal_height=True):
        with gr.Column(scale=2, elem_id="stage"):
            output = gr.Image(label="Live diffusion", type="pil", height=430)
            status = gr.Markdown("### Ready\nChoose a digit and start diffusion.", elem_id="status")
        with gr.Column(scale=1):
            digit = gr.Slider(0, 9, value=6, step=1, label="Requested digit")
            model = gr.Radio(list(MODEL_FILES), value="FP32 deployment", label="Checkpoint")
            mode = gr.Radio(
                ["Fast DDIM · 100 steps", "Detailed DDIM · 200 steps", "Full DDPM · 1000 steps"],
                value="Full DDPM · 1000 steps",
                label="Sampling path",
            )
            curated = gr.Checkbox(value=True, label="Use visually audited FP32 seed")
            seed = gr.Number(value=12, precision=0, label="Custom noise seed")
            run = gr.Button("Start diffusion", variant="primary", size="lg")
            gr.Markdown(
                "The **Full DDPM** option matches the board's 1,000-step sampler. "
                "The W1A32 checkpoint uses binary convolutional weights with FP32 activations "
                "and surrounding operations; this browser demo is not a packed binary kernel."
            )

    run.click(
        generate,
        inputs=[digit, model, mode, seed, curated],
        outputs=[output, status],
        concurrency_limit=1,
    )

    gr.Markdown(
        "---\nBuilt from [MonoDiffuse](https://github.com/elixpo/monodiffuse). "
        "The evaluator label is diagnostic, not a perceptual-quality guarantee."
    )


if __name__ == "__main__":
    demo.queue(max_size=16).launch(
        css=CSS,
        theme=gr.themes.Soft(primary_hue="violet", secondary_hue="cyan"),
    )
