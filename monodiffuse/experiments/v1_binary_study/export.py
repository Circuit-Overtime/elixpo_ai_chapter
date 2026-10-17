"""Export inference weights with binary convolutions physically bit-packed."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from .models import BinaryDiffusionUNet, ModelConfig, QuantConv2d
from .utils import atomic_json, sha256


def packed_state(checkpoint_path: Path) -> tuple[dict[str, np.ndarray], dict]:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model = BinaryDiffusionUNet(ModelConfig(**checkpoint["model_config"]))
    model.load_state_dict(checkpoint["model"])
    arrays: dict[str, np.ndarray] = {}
    manifest: dict[str, dict] = {}
    binary_bits = 0
    floating_values = 0

    binary_weight_names = {
        f"{name}.weight": module
        for name, module in model.named_modules()
        if isinstance(module, QuantConv2d) and module.binary
    }
    for name, value in model.state_dict().items():
        tensor = value.detach().cpu().float()
        if name in binary_weight_names:
            module = binary_weight_names[name]
            source = tensor
            if module.centered:
                source = source - source.mean(dim=(1, 2, 3), keepdim=True)
            scale = source.abs().mean(dim=(1, 2, 3)).clamp_min(1e-8).numpy().astype(np.float32)
            signs = (source.numpy().reshape(-1) >= 0).astype(np.uint8)
            arrays[f"{name}.packed"] = np.packbits(signs, bitorder="little")
            arrays[f"{name}.scale"] = scale
            binary_bits += signs.size
            floating_values += scale.size
            manifest[name] = {
                "kind": "binary_per_output_channel",
                "shape": list(tensor.shape),
                "elements": int(signs.size),
                "centered": module.centered,
            }
        else:
            arrays[name] = tensor.numpy().astype(np.float32)
            floating_values += tensor.numel()
            manifest[name] = {"kind": "float32", "shape": list(tensor.shape)}

    payload_bytes = (binary_bits + 7) // 8 + 4 * floating_values
    metadata = {
        "source_checkpoint": str(checkpoint_path),
        "source_sha256": sha256(checkpoint_path),
        "dataset": checkpoint["dataset"],
        "variant": checkpoint["variant"],
        "seed": checkpoint["seed"],
        "binary_weight_bits": binary_bits,
        "float32_values_including_scales": floating_values,
        "packed_payload_bytes": payload_bytes,
        "fp32_equivalent_bytes": 4 * sum(value.numel() for value in model.state_dict().values()),
        "tensors": manifest,
    }
    return arrays, metadata


def export_checkpoint(checkpoint_path: Path, output: Path | None = None) -> Path:
    arrays, metadata = packed_state(checkpoint_path)
    output = output or checkpoint_path.with_name("inference_weights.npz")
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez(output, **arrays)
    metadata["container_bytes"] = output.stat().st_size
    metadata["container_sha256"] = sha256(output)
    atomic_json(output.with_suffix(".json"), metadata)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    path = export_checkpoint(args.checkpoint, args.output)
    print(json.dumps({"output": str(path), "bytes": path.stat().st_size}))


if __name__ == "__main__":
    main()
