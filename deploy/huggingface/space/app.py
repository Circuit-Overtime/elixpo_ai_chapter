from __future__ import annotations

import os
import time
from functools import lru_cache

import gradio as gr
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image

try:
    import spaces
except ImportError:
    class _LocalSpaces:
        """Keep the Space runnable outside Hugging Face ZeroGPU."""

        @staticmethod
        def GPU(*args, **kwargs):
            del args, kwargs

            def decorator(function):
                return function

            return decorator

    spaces = _LocalSpaces()


MODEL_REPO = os.getenv("MODEL_REPO", "Elixpo/monodiffuse")
MODEL_DIR = os.getenv("MODEL_DIR")
DIFFUSION_STEPS = 1000
FRAME_DELAY_SECONDS = 0.08
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


@spaces.GPU(duration=30)
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
    time.sleep(FRAME_DELAY_SECONDS)

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
            time.sleep(FRAME_DELAY_SECONDS)

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
.gradio-container {max-width: 1080px !important; margin: auto !important;
  padding: 10px 18px 8px !important; min-height: 100vh;}
#hero {text-align:center; padding: 0 0 6px;}
#hero h1 {font-size: clamp(2rem, 4vw, 3.1rem); line-height: 1; margin: 0 0 .12em;
  background: linear-gradient(90deg,#7c3aed,#22d3ee); -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;}
#hero p {margin: 0; font-size: .95rem; opacity: .78;}
#workspace {gap: 14px !important; align-items: stretch;}
#stage {border: 1px solid rgba(124,58,237,.35); border-radius: 24px;
  box-shadow: 0 20px 80px rgba(76,29,149,.16); overflow:hidden;}
#stage .image-container {min-height: 0 !important;}
#status {min-height: 64px; padding: 2px 12px; font-size: .9rem;}
#status h3 {margin: .2rem 0 !important; font-size: 1rem;}
#controls {gap: 8px !important;}
#controls .block {margin: 0 !important;}
.compact-row {gap: 8px !important;}
.gradient-selector .wrap {gap: 6px !important; flex-direction: row !important;
  flex-wrap: nowrap !important;}
.gradient-selector label:has(input[type="radio"]) {flex: 1 1 0; min-width: 0;
  justify-content: center; text-align: center; padding: 8px 7px !important;
  border: 1px solid rgba(124,58,237,.3) !important; border-radius: 11px !important;
  background: linear-gradient(145deg,rgba(124,58,237,.08),rgba(34,211,238,.05));
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;}
.gradient-selector label:has(input[type="radio"]):hover {transform: translateY(-1px);
  border-color: rgba(34,211,238,.8) !important;}
.gradient-selector label:has(input[type="radio"]:checked) {
  color: white !important; border-color: transparent !important;
  background: linear-gradient(115deg,#7c3aed,#2563eb 55%,#0891b2) !important;
  box-shadow: 0 5px 16px rgba(76,29,149,.25);}
.gradient-selector label:has(input[type="radio"]:checked) span {color: white !important;}
.gradient-selector input[type="radio"] {display: none !important;}
#run-button {min-height: 42px !important; border: 0 !important;
  background: linear-gradient(105deg,#7c3aed,#2563eb 55%,#0891b2) !important;
  box-shadow: 0 8px 22px rgba(76,29,149,.24);}
#footer-note {font-size: .78rem; line-height: 1.35; opacity: .72; text-align: center;
  padding: 3px 10px 0;}
#footer-note p {margin: 0 !important;}
@media (max-width: 760px) {
  .gradio-container {padding: 8px 10px !important;}
  .gradient-selector .wrap {flex-wrap: wrap !important;}
  .gradient-selector label:has(input[type="radio"]) {min-width: 46%;}
}
"""


with gr.Blocks() as demo:
    gr.HTML(
        "<div id='hero'><h1>Diffuino Live</h1></div>"
    )
    with gr.Row(equal_height=True, elem_id="workspace"):
        with gr.Column(scale=2, elem_id="stage"):
            output = gr.Image(label="Live diffusion", type="pil", height=330)
            status = gr.Markdown("### Ready\nChoose a digit and start diffusion.", elem_id="status")
        with gr.Column(scale=1, elem_id="controls"):
            with gr.Row(elem_classes=["compact-row"]):
                digit = gr.Slider(0, 9, value=6, step=1, label="Digit", scale=3)
                seed = gr.Number(value=12, precision=0, label="Seed", scale=1)
            model = gr.Radio(
                list(MODEL_FILES),
                value="FP32 deployment",
                label="Checkpoint",
                elem_classes=["gradient-selector"],
            )
            mode = gr.Radio(
                ["Fast DDIM · 100 steps", "Detailed DDIM · 200 steps", "Full DDPM · 1000 steps"],
                value="Full DDPM · 1000 steps",
                label="Sampling path",
                elem_classes=["gradient-selector"],
            )
            curated = gr.Checkbox(value=True, label="Use visually audited FP32 seed")
            run = gr.Button(
                "Start diffusion",
                variant="primary",
                size="lg",
                elem_id="run-button",
            )

    run.click(
        generate,
        inputs=[digit, model, mode, seed, curated],
        outputs=[output, status],
        concurrency_limit=1,
    )

    gr.Markdown(
        "[Source](https://github.com/elixpo/monodiffuse) · "
        "[Circuit](https://github.com/elixpo/monodiffuse/tree/main/hardware/diffuino_selector)",
        elem_id="footer-note",
    )


if __name__ == "__main__":
    demo.queue(max_size=16).launch(
        css=CSS,
        theme=gr.themes.Soft(primary_hue="violet", secondary_hue="cyan"),
    )
