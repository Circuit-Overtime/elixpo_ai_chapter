"""Train the class-conditioned native W1A32 MNIST model used by Diffuino."""

from __future__ import annotations

import argparse
import time
from dataclasses import asdict
from pathlib import Path

import torch
from torch.amp import GradScaler, autocast
from tqdm import tqdm

from experiments.v1_binary_study.data import loader
from experiments.v1_binary_study.diffusion import Diffusion
from experiments.v1_binary_study.models import BinaryDiffusionUNet, ModelConfig
from experiments.v1_binary_study.utils import atomic_json, provenance, seed_everything, sha256


ROOT = Path(__file__).resolve().parents[2]


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--epochs", type=int, default=12)
    result.add_argument("--batch-size", type=int, default=256)
    result.add_argument("--base-channels", type=int, default=16)
    result.add_argument("--precision", choices=("fp32", "binary"), default="binary")
    result.add_argument("--learning-rate", type=float, default=2e-4)
    result.add_argument(
        "--init",
        type=Path,
        help="parameter-compatible checkpoint used to warm-start training",
    )
    result.add_argument("--seed", type=int, default=0)
    result.add_argument("--workers", type=int, default=2)
    result.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    result.add_argument("--data", type=Path, default=ROOT / "data")
    result.add_argument("--output", type=Path)
    return result


def train(args: argparse.Namespace) -> Path:
    seed_everything(args.seed)
    device = torch.device(args.device)
    config = ModelConfig(
        image_channels=1,
        base_channels=args.base_channels,
        binary_weights=args.precision == "binary",
        centered=False,
        binary_activations=False,
        preactivation=True,
        num_classes=10,
    )
    model = BinaryDiffusionUNet(config).to(device)
    initialization = None
    if args.init is not None:
        payload = torch.load(args.init, map_location="cpu", weights_only=False)
        source_config = ModelConfig(**payload["model_config"])
        if source_config.num_classes != config.num_classes:
            raise ValueError(
                f"initial checkpoint has {source_config.num_classes} classes; "
                f"expected {config.num_classes}"
            )
        model.load_state_dict(payload["model"])
        initialization = {
            "checkpoint": str(args.init),
            "checkpoint_sha256": sha256(args.init),
            "source_binary_weights": source_config.binary_weights,
        }
    diffusion = Diffusion(1000).to(device)
    train_loader = loader("mnist", args.data, True, args.batch_size, args.workers, args.seed)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = GradScaler("cuda", enabled=device.type == "cuda")
    history = []
    started = time.time()

    for epoch in range(args.epochs):
        model.train()
        loss_sum = 0.0
        examples = 0
        progress = tqdm(train_loader, desc=f"diffuino conditional e{epoch + 1}/{args.epochs}")
        for clean, labels in progress:
            clean = clean.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)
            timestep = torch.randint(0, diffusion.steps, (clean.shape[0],), device=device)
            noise = torch.randn_like(clean)
            alpha_bar = diffusion.alpha_bars[timestep][:, None, None, None]
            noisy = alpha_bar.sqrt() * clean + (1 - alpha_bar).sqrt() * noise

            optimizer.zero_grad(set_to_none=True)
            with autocast("cuda", enabled=scaler.is_enabled()):
                predicted = model(noisy, timestep, labels)
                loss = torch.nn.functional.mse_loss(predicted, noise)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            loss_sum += loss.item() * clean.shape[0]
            examples += clean.shape[0]
            progress.set_postfix(loss=f"{loss.item():.4f}")
        scheduler.step()
        history.append(
            {
                "epoch": epoch + 1,
                "train_loss": loss_sum / examples,
                "learning_rate": optimizer.param_groups[0]["lr"],
            }
        )

    output = args.output or (
        ROOT
        / "apps"
        / "diffuino"
        / "models"
        / f"mnist_conditional_{'w1a32' if args.precision == 'binary' else 'fp32'}.pt"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": model.cpu().state_dict(),
        "model_config": asdict(config),
        "dataset": "mnist",
        "variant": f"conditional_{'native_uncentered_pre' if args.precision == 'binary' else 'fp32'}",
        "seed": args.seed,
        "initialization": initialization,
        "training": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "diffusion_steps": 1000,
            "elapsed_seconds": time.time() - started,
        },
        "history": history,
        "provenance": provenance(),
    }
    torch.save(payload, output)
    atomic_json(
        output.with_suffix(".json"),
        {key: value for key, value in payload.items() if key != "model"}
        | {"checkpoint_sha256": sha256(output)},
    )
    print(f"saved {output}")
    return output


if __name__ == "__main__":
    train(parser().parse_args())
