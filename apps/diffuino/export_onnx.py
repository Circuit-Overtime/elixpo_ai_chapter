"""Materialize binary weights and export the Diffuino denoiser to ONNX."""

from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path

import torch

from experiments.v1_binary_study.models import BinaryDiffusionUNet, ModelConfig, QuantConv2d
from experiments.v1_binary_study.evaluate import DigitEncoder


ROOT = Path(__file__).resolve().parents[2]


def materialized_model(checkpoint: Path) -> BinaryDiffusionUNet:
    payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
    source_config = ModelConfig(**payload["model_config"])
    source = BinaryDiffusionUNet(source_config)
    source.load_state_dict(payload["model"])
    source.eval()

    deployment_config = replace(source_config, binary_weights=False, centered=False)
    deployment = BinaryDiffusionUNet(deployment_config)
    deployment.load_state_dict(payload["model"])
    source_modules = dict(source.named_modules())
    with torch.no_grad():
        for name, target_module in deployment.named_modules():
            source_module = source_modules[name]
            if isinstance(source_module, QuantConv2d) and source_module.binary:
                target_module.weight.copy_(source_module.quantized_weight())
    return deployment.eval()


def export(checkpoint: Path, output: Path) -> Path:
    model = materialized_model(checkpoint)
    output.parent.mkdir(parents=True, exist_ok=True)
    conditional = model.config.num_classes > 0
    example_inputs = [
        torch.zeros(1, 1, 28, 28, dtype=torch.float32),
        torch.zeros(1, dtype=torch.long),
    ]
    input_names = ["image", "timestep"]
    if conditional:
        example_inputs.append(torch.zeros(1, dtype=torch.long))
        input_names.append("label")
    torch.onnx.export(
        model,
        tuple(example_inputs),
        output,
        input_names=input_names,
        output_names=["predicted_noise"],
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"saved {output} ({output.stat().st_size} bytes)")
    return output


def export_classifier(checkpoint: Path, output: Path) -> Path:
    """Export the held-out MNIST evaluation encoder for demo-only digit naming."""
    payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model = DigitEncoder(channels=1, classes=10)
    model.load_state_dict(payload["model"])
    model.eval()
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        torch.zeros(1, 1, 28, 28, dtype=torch.float32),
        output,
        input_names=["image"],
        output_names=["logits"],
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"saved {output} ({output.stat().st_size} bytes)")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=ROOT
        / "artifacts"
        / "v1_binary_study"
        / "mnist"
        / "native_uncentered_pre"
        / "seed_2"
        / "checkpoint.pt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "apps" / "diffuino" / "models" / "mnist_unconditional_w1a32.onnx",
    )
    parser.add_argument(
        "--classifier-checkpoint",
        type=Path,
        default=ROOT
        / "artifacts"
        / "v1_binary_study"
        / "mnist"
        / "evaluation_encoder.pt",
    )
    parser.add_argument(
        "--classifier-output",
        type=Path,
        default=ROOT / "apps" / "diffuino" / "models" / "mnist_classifier.onnx",
    )
    arguments = parser.parse_args()
    export(arguments.checkpoint, arguments.output)
    export_classifier(arguments.classifier_checkpoint, arguments.classifier_output)
