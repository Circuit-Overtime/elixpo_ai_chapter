"""Training and conversion entry points for the controlled study."""

from __future__ import annotations

import argparse
import copy
import json
import time
from dataclasses import asdict
from pathlib import Path

import torch
from torch import nn
from torch.amp import GradScaler, autocast
from tqdm import tqdm

from .data import DATASET_INFO, loader
from .diffusion import Diffusion
from .models import BinaryDiffusionUNet, ModelConfig, QuantConv2d, model_statistics
from .utils import atomic_json, provenance, seed_everything, sha256


VARIANTS = {
    "fp": {},
    "native_uncentered_post": {"binary_weights": True, "preactivation": False},
    "native_centered_post": {"binary_weights": True, "centered": True, "preactivation": False},
    "native_uncentered_pre": {"binary_weights": True},
    "native_centered_pre": {"binary_weights": True, "centered": True},
    "native_w1a1_core": {"binary_weights": True, "centered": True, "binary_activations": True},
    "ptq_uncentered": {"binary_weights": True},
    "ptq_centered": {"binary_weights": True, "centered": True},
    "warm_qat_centered": {"binary_weights": True, "centered": True},
}


def config_for(dataset_name: str, variant: str, base_channels: int) -> ModelConfig:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    return ModelConfig(
        image_channels=DATASET_INFO[dataset_name]["channels"],
        base_channels=base_channels,
        **VARIANTS[variant],
    )


def artifact_dir(root: Path, dataset_name: str, variant: str, seed: int) -> Path:
    return root / dataset_name / variant / f"seed_{seed}"


def load_checkpoint(path: Path, model: nn.Module) -> dict:
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model"])
    return checkpoint


def quantization_diagnostics(model: nn.Module) -> dict[str, float]:
    cosine, sign_balance, angular = [], [], []
    for module in model.modules():
        if not isinstance(module, QuantConv2d) or not module.binary:
            continue
        with torch.no_grad():
            latent = module.weight.flatten(1)
            source = module.weight
            if module.centered:
                source = source - source.mean(dim=(1, 2, 3), keepdim=True)
            scale = source.abs().mean(dim=(1, 2, 3), keepdim=True)
            quantized = (torch.where(source >= 0, 1.0, -1.0) * scale).flatten(1)
            cos = nn.functional.cosine_similarity(latent, quantized, dim=1).clamp(-1, 1)
            cosine.extend(cos.cpu().tolist())
            angular.extend(torch.rad2deg(torch.acos(cos)).cpu().tolist())
            sign_balance.append((source >= 0).float().mean().item())
    if not cosine:
        return {}
    return {
        "mean_cosine_latent_to_quantized": sum(cosine) / len(cosine),
        "mean_angular_error_degrees": sum(angular) / len(angular),
        "mean_positive_sign_fraction": sum(sign_balance) / len(sign_balance),
    }


def train_one(args, variant: str, seed: int, initialization: Path | None = None) -> Path:
    if variant.startswith("ptq_"):
        raise ValueError("PTQ variants are produced with convert_ptq")
    seed_everything(seed)
    output = artifact_dir(args.artifacts, args.dataset, variant, seed)
    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    if checkpoint_path.exists() and not args.overwrite:
        print(f"reuse {checkpoint_path}")
        return checkpoint_path

    config = config_for(args.dataset, variant, args.base_channels)
    model = BinaryDiffusionUNet(config)
    initialization_metadata = None
    if initialization is not None:
        source = load_checkpoint(initialization, model)
        initialization_metadata = {"path": str(initialization), "sha256": sha256(initialization), "variant": source["variant"]}

    device = torch.device(args.device)
    model.to(device)
    diffusion = Diffusion(args.diffusion_steps).to(device)
    train_loader = loader(args.dataset, args.data, True, args.batch_size, args.workers, seed)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = GradScaler("cuda", enabled=args.amp and device.type == "cuda")
    history = []
    started = time.time()

    for epoch in range(args.epochs):
        model.train()
        running = 0.0
        progress = tqdm(train_loader, desc=f"{args.dataset}/{variant}/s{seed} e{epoch + 1}/{args.epochs}")
        examples_seen = 0
        for batch_index, (clean, _) in enumerate(progress):
            if args.max_batches is not None and batch_index >= args.max_batches:
                break
            clean = clean.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with autocast("cuda", enabled=scaler.is_enabled()):
                loss = diffusion.training_loss(model, clean)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            scaler.step(optimizer)
            scaler.update()
            running += loss.item() * clean.shape[0]
            examples_seen += clean.shape[0]
            progress.set_postfix(loss=f"{loss.item():.4f}")
        epoch_loss = running / examples_seen
        history.append({"epoch": epoch + 1, "train_loss": epoch_loss, "lr": optimizer.param_groups[0]["lr"]})
        scheduler.step()
        atomic_json(output / "history.json", {"epochs": history})

    model.cpu()
    payload = {
        "model": model.state_dict(),
        "model_config": asdict(config),
        "variant": variant,
        "dataset": args.dataset,
        "seed": seed,
        "training": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "weight_decay": args.weight_decay,
            "diffusion_steps": args.diffusion_steps,
            "amp": args.amp,
            "elapsed_seconds": time.time() - started,
            "max_batches_per_epoch": args.max_batches,
        },
        "initialization": initialization_metadata,
        "model_statistics": model_statistics(model),
        "quantization_diagnostics": quantization_diagnostics(model),
        "provenance": provenance(),
    }
    torch.save(payload, checkpoint_path)
    atomic_json(output / "metadata.json", {k: v for k, v in payload.items() if k != "model"} | {"checkpoint_sha256": sha256(checkpoint_path)})
    return checkpoint_path


def convert_ptq(args, source: Path, variant: str, seed: int) -> Path:
    seed_everything(seed)
    output = artifact_dir(args.artifacts, args.dataset, variant, seed)
    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    if checkpoint_path.exists() and not args.overwrite:
        print(f"reuse {checkpoint_path}")
        return checkpoint_path
    config = config_for(args.dataset, variant, args.base_channels)
    model = BinaryDiffusionUNet(config)
    source_payload = load_checkpoint(source, model)
    payload = {
        "model": model.state_dict(),
        "model_config": asdict(config),
        "variant": variant,
        "dataset": args.dataset,
        "seed": seed,
        "training": None,
        "initialization": {"path": str(source), "sha256": sha256(source), "variant": source_payload["variant"]},
        "model_statistics": model_statistics(model),
        "quantization_diagnostics": quantization_diagnostics(model),
        "provenance": provenance(),
    }
    torch.save(payload, checkpoint_path)
    atomic_json(output / "metadata.json", {k: v for k, v in payload.items() if k != "model"} | {"checkpoint_sha256": sha256(checkpoint_path)})
    return checkpoint_path


def run_suite(args) -> None:
    seeds = [int(value) for value in args.seeds.split(",")]
    all_native_variants = [
        "fp",
        "native_uncentered_post",
        "native_centered_post",
        "native_uncentered_pre",
        "native_centered_pre",
        "native_w1a1_core",
    ]
    selected = set(args.suite_variants.split(",")) if args.suite_variants else set(VARIANTS)
    unknown = selected - set(VARIANTS)
    if unknown:
        raise ValueError(f"unknown suite variants: {', '.join(sorted(unknown))}")
    needs_fp = bool(selected & {"ptq_uncentered", "ptq_centered", "warm_qat_centered"})
    native_variants = [
        variant for variant in all_native_variants
        if variant in selected or (variant == "fp" and needs_fp)
    ]
    for seed in seeds:
        checkpoints = {variant: train_one(args, variant, seed) for variant in native_variants}
        if "ptq_uncentered" in selected:
            convert_ptq(args, checkpoints["fp"], "ptq_uncentered", seed)
        if "ptq_centered" in selected:
            convert_ptq(args, checkpoints["fp"], "ptq_centered", seed)
        if "warm_qat_centered" in selected:
            train_one(args, "warm_qat_centered", seed, initialization=checkpoints["fp"])


def parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[2]
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("command", choices=("train", "suite"))
    result.add_argument("--dataset", choices=DATASET_INFO, default="mnist")
    result.add_argument("--variant", choices=VARIANTS, default="native_centered_pre")
    result.add_argument("--seeds", default="0,1,2")
    result.add_argument(
        "--suite-variants",
        default="",
        help="Comma-separated suite subset; FP is added automatically for PTQ and warm-start variants",
    )
    result.add_argument("--epochs", type=int, default=20)
    result.add_argument("--batch-size", type=int, default=128)
    result.add_argument("--base-channels", type=int, default=32)
    result.add_argument("--diffusion-steps", type=int, default=1000)
    result.add_argument("--lr", type=float, default=2e-4)
    result.add_argument("--weight-decay", type=float, default=1e-4)
    result.add_argument("--grad-clip", type=float, default=1.0)
    result.add_argument("--workers", type=int, default=2)
    result.add_argument("--max-batches", type=int, default=None, help="Debug-only cap recorded in metadata")
    result.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    result.add_argument("--data", type=Path, default=root / "data")
    result.add_argument("--artifacts", type=Path, default=root / "artifacts" / "v1_binary_study")
    result.add_argument("--amp", action=argparse.BooleanOptionalAction, default=True)
    result.add_argument("--overwrite", action="store_true")
    return result


def main() -> None:
    args = parser().parse_args()
    if args.command == "suite":
        run_suite(args)
    else:
        if args.variant.startswith("ptq_"):
            raise SystemExit("PTQ variants are created by the suite from the matching FP checkpoint")
        train_one(args, args.variant, int(args.seeds.split(",")[0]))


if __name__ == "__main__":
    main()
