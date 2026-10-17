"""Train domain encoders and evaluate generated distributions with sanity controls."""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch
from scipy import linalg
from torch import nn
from torch.nn import functional as F
from torchvision.utils import save_image
from tqdm import tqdm

from .data import DATASET_INFO, dataset, loader
from .diffusion import Diffusion
from .models import BinaryDiffusionUNet, ModelConfig
from .utils import atomic_json, provenance, seed_everything, sha256


class DigitEncoder(nn.Module):
    def __init__(self, channels: int, classes: int):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(channels, 32, 3, padding=1), nn.BatchNorm2d(32), nn.SiLU(),
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.SiLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.SiLU(),
            nn.AdaptiveAvgPool2d(1),
        )
        self.head = nn.Linear(128, classes)

    def forward(self, x: torch.Tensor, return_features: bool = False):
        features = self.features(x).flatten(1)
        logits = self.head(features)
        return (logits, features) if return_features else logits


class CifarEncoder(nn.Module):
    def __init__(self, classes: int):
        super().__init__()
        from torchvision.models import resnet18

        network = resnet18(weights=None, num_classes=classes)
        network.conv1 = nn.Conv2d(3, 64, 3, stride=1, padding=1, bias=False)
        network.maxpool = nn.Identity()
        self.backbone = network

    def forward(self, x: torch.Tensor, return_features: bool = False):
        n = self.backbone
        h = n.relu(n.bn1(n.conv1(x)))
        h = n.layer1(h)
        h = n.layer2(h)
        h = n.layer3(h)
        h = n.layer4(h)
        features = n.avgpool(h).flatten(1)
        logits = n.fc(features)
        return (logits, features) if return_features else logits


def make_encoder(name: str) -> nn.Module:
    info = DATASET_INFO[name]
    return CifarEncoder(info["classes"]) if name == "cifar10" else DigitEncoder(info["channels"], info["classes"])


@torch.inference_mode()
def encoder_stats(model: nn.Module, data_loader, device: torch.device) -> dict[str, float]:
    model.eval()
    confidence, correctness = [], []
    for images, labels in data_loader:
        probabilities = model(images.to(device)).softmax(1).cpu()
        confidence.append(probabilities.max(1).values)
        correctness.append(probabilities.argmax(1).eq(labels))
    confidence = torch.cat(confidence)
    correctness = torch.cat(correctness)
    ece = 0.0
    for low in torch.linspace(0, 0.9, 10):
        mask = (confidence >= low) & (confidence < low + 0.1)
        if mask.any():
            ece += mask.float().mean().item() * abs(confidence[mask].mean().item() - correctness[mask].float().mean().item())
    return {
        "accuracy": correctness.float().mean().item(),
        "mean_confidence": confidence.mean().item(),
        "expected_calibration_error_10_bin": ece,
    }


def train_encoder(args) -> Path:
    seed_everything(args.encoder_seed)
    output = args.artifacts / args.dataset / "evaluation_encoder.pt"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not args.overwrite:
        print(f"reuse {output}")
        return output
    device = torch.device(args.device)
    model = make_encoder(args.dataset).to(device)
    train_loader = loader(args.dataset, args.data, True, args.encoder_batch_size, args.workers, args.encoder_seed)
    test_loader = loader(args.dataset, args.data, False, args.encoder_batch_size, args.workers, args.encoder_seed)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.encoder_lr, weight_decay=5e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, args.encoder_epochs)
    best_accuracy = -1.0
    best_state = None
    history = []
    for epoch in range(args.encoder_epochs):
        model.train()
        total_loss = 0.0
        for images, labels in tqdm(train_loader, desc=f"encoder {args.dataset} e{epoch + 1}/{args.encoder_epochs}"):
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = F.cross_entropy(model(images), labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * images.shape[0]
        stats = encoder_stats(model, test_loader, device)
        stats |= {"epoch": epoch + 1, "train_loss": total_loss / len(train_loader.dataset)}
        history.append(stats)
        if stats["accuracy"] > best_accuracy:
            best_accuracy = stats["accuracy"]
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        scheduler.step()
    payload = {
        "model": best_state,
        "dataset": args.dataset,
        "seed": args.encoder_seed,
        "history": history,
        "test": max(history, key=lambda row: row["accuracy"]),
        "provenance": provenance(),
    }
    torch.save(payload, output)
    atomic_json(output.with_suffix(".json"), {k: v for k, v in payload.items() if k != "model"} | {"sha256": sha256(output)})
    return output


@torch.inference_mode()
def encode(model: nn.Module, images: torch.Tensor, device: torch.device):
    logits, features = model(images.to(device), return_features=True)
    return features.cpu(), logits.softmax(1).cpu()


@torch.inference_mode()
def real_features(args, encoder, device):
    data = dataset(args.dataset, args.data, train=False)
    data_loader = torch.utils.data.DataLoader(data, batch_size=args.eval_batch_size, shuffle=False, num_workers=args.workers)
    features, probabilities = [], []
    for images, _ in tqdm(data_loader, desc="encode real"):
        feature, probability = encode(encoder, images, device)
        features.append(feature)
        probabilities.append(probability)
        if sum(len(value) for value in features) >= args.eval_samples:
            break
    return torch.cat(features)[: args.eval_samples], torch.cat(probabilities)[: args.eval_samples]


@torch.inference_mode()
def generated_features(args, checkpoint_path: Path, encoder, device):
    payload = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    config = ModelConfig(**payload["model_config"])
    model = BinaryDiffusionUNet(config)
    model.load_state_dict(payload["model"])
    model.to(device).eval()
    diffusion = Diffusion(payload.get("training", {}).get("diffusion_steps", args.diffusion_steps) if payload.get("training") else args.diffusion_steps).to(device)
    features, probabilities, preview = [], [], []
    generator = torch.Generator(device=device).manual_seed(args.sample_seed)
    remaining = args.eval_samples
    progress = tqdm(total=args.eval_samples, desc=f"sample {payload['variant']}/s{payload['seed']}")
    while remaining:
        batch = min(args.eval_batch_size, remaining)
        shape = (batch, config.image_channels, DATASET_INFO[args.dataset]["size"], DATASET_INFO[args.dataset]["size"])
        images = (
            diffusion.sample_ddpm(model, shape, generator)
            if args.sampler == "ddpm"
            else diffusion.sample(model, shape, args.sampling_steps, generator)
        )
        if len(preview) < 64:
            preview.append(images.cpu())
        feature, probability = encode(encoder, images, device)
        features.append(feature)
        probabilities.append(probability)
        remaining -= batch
        progress.update(batch)
    progress.close()
    output = checkpoint_path.parent
    save_image(torch.cat(preview)[:64].add(1).div(2), output / "samples.png", nrow=8)
    return torch.cat(features), torch.cat(probabilities), payload


def frechet(features_a: torch.Tensor, features_b: torch.Tensor) -> float:
    a, b = features_a.double().numpy(), features_b.double().numpy()
    mean_a, mean_b = a.mean(0), b.mean(0)
    covariance_a, covariance_b = np.cov(a, rowvar=False), np.cov(b, rowvar=False)
    covariance_mean = linalg.sqrtm(covariance_a @ covariance_b)
    if np.iscomplexobj(covariance_mean):
        covariance_mean = covariance_mean.real
    return float(np.sum((mean_a - mean_b) ** 2) + np.trace(covariance_a + covariance_b - 2 * covariance_mean))


def kernel_inception_distance(a: torch.Tensor, b: torch.Tensor) -> float:
    a, b = a.double(), b.double()
    dimension = a.shape[1]
    kernel_aa = (a @ a.T / dimension + 1).pow(3)
    kernel_bb = (b @ b.T / dimension + 1).pow(3)
    kernel_ab = (a @ b.T / dimension + 1).pow(3)
    n, m = len(a), len(b)
    return float(
        (kernel_aa.sum() - kernel_aa.diag().sum()) / (n * (n - 1))
        + (kernel_bb.sum() - kernel_bb.diag().sum()) / (m * (m - 1))
        - 2 * kernel_ab.mean()
    )


def kth_real_radius(real: torch.Tensor, k: int, chunk: int = 512) -> torch.Tensor:
    radii = []
    for start in range(0, len(real), chunk):
        distance = torch.cdist(real[start : start + chunk], real)
        radii.append(distance.kthvalue(k + 1, dim=1).values)  # includes self at zero
    return torch.cat(radii)


def density_coverage(real: torch.Tensor, fake: torch.Tensor, k: int = 5, chunk: int = 256):
    real = real.float()
    fake = fake.float()
    radii = kth_real_radius(real, k)
    density_total = 0.0
    real_hit = torch.zeros(len(real), dtype=torch.bool)
    for start in range(0, len(fake), chunk):
        distance = torch.cdist(fake[start : start + chunk], real)
        inside = distance <= radii[None]
        density_total += inside.sum().item()
        real_hit |= inside.any(0)
    return density_total / (k * len(fake)), real_hit.float().mean().item()


def js_divergence(probability_a: torch.Tensor, probability_b: torch.Tensor) -> float:
    a = probability_a.mean(0).double().clamp_min(1e-12)
    b = probability_b.mean(0).double().clamp_min(1e-12)
    middle = (a + b) / 2
    return float(0.5 * (a * (a.log() - middle.log())).sum() + 0.5 * (b * (b.log() - middle.log())).sum())


def distribution_metrics(real_feature, real_probability, fake_feature, fake_probability):
    density, coverage = density_coverage(real_feature, fake_feature)
    return {
        "feature_fid": frechet(real_feature, fake_feature),
        "feature_kid": kernel_inception_distance(real_feature, fake_feature),
        "density": density,
        "coverage": coverage,
        "class_js_divergence": js_divergence(real_probability, fake_probability),
        "mean_classifier_confidence": fake_probability.max(1).values.mean().item(),
    }


def evaluate_suite(args) -> None:
    encoder_path = train_encoder(args)
    encoder_payload = torch.load(encoder_path, map_location="cpu", weights_only=False)
    encoder = make_encoder(args.dataset)
    encoder.load_state_dict(encoder_payload["model"])
    device = torch.device(args.device)
    encoder.to(device).eval()
    real_feature, real_probability = real_features(args, encoder, device)
    half = len(real_feature) // 2
    controls = {
        "real_real": distribution_metrics(real_feature[:half], real_probability[:half], real_feature[half : 2 * half], real_probability[half : 2 * half])
    }
    noise = torch.randn(args.eval_samples, DATASET_INFO[args.dataset]["channels"], DATASET_INFO[args.dataset]["size"], DATASET_INFO[args.dataset]["size"]).clamp(-1, 1)
    noise_features, noise_probabilities = [], []
    for batch in noise.split(args.eval_batch_size):
        feature, probability = encode(encoder, batch, device)
        noise_features.append(feature)
        noise_probabilities.append(probability)
    controls["gaussian_noise"] = distribution_metrics(real_feature, real_probability, torch.cat(noise_features), torch.cat(noise_probabilities))
    atomic_json(args.artifacts / args.dataset / "evaluation_controls.json", controls | {"encoder": encoder_payload["test"]})

    rows = []
    checkpoints = sorted((args.artifacts / args.dataset).glob("*/seed_*/checkpoint.pt"))
    if args.variants:
        allowed = set(args.variants.split(","))
        checkpoints = [path for path in checkpoints if path.parent.parent.name in allowed]
    for checkpoint_path in checkpoints:
        metric_path = checkpoint_path.parent / "metrics.json"
        if args.resume and metric_path.exists():
            with metric_path.open() as handle:
                rows.append(json.load(handle))
            print(f"reuse {metric_path}")
            continue
        fake_feature, fake_probability, payload = generated_features(args, checkpoint_path, encoder, device)
        metrics = distribution_metrics(real_feature, real_probability, fake_feature, fake_probability)
        row = {"dataset": args.dataset, "variant": payload["variant"], "seed": payload["seed"], **metrics}
        atomic_json(metric_path, row)
        rows.append(row)
    result_path = args.artifacts / args.dataset / "results.csv"
    with result_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    summarize(args.artifacts / args.dataset, rows, controls, encoder_payload)


def summarize(output: Path, rows: list[dict], controls: dict, encoder_payload: dict) -> None:
    grouped = {}
    metric_names = [key for key in rows[0] if key not in {"dataset", "variant", "seed"}]
    for row in rows:
        grouped.setdefault(row["variant"], []).append(row)
    summary = {
        "encoder_test": encoder_payload["test"],
        "controls": controls,
        "variants": {},
    }
    for variant, values in grouped.items():
        summary["variants"][variant] = {
            metric: {
                "mean": float(np.mean([row[metric] for row in values])),
                "sample_std": float(np.std([row[metric] for row in values], ddof=1)) if len(values) > 1 else None,
                "training_seeds": len(values),
            }
            for metric in metric_names
        }
    atomic_json(output / "summary.json", summary)


def parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[2]
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("command", choices=("train-encoder", "suite"))
    result.add_argument("--dataset", choices=DATASET_INFO, default="mnist")
    result.add_argument("--data", type=Path, default=root / "data")
    result.add_argument("--artifacts", type=Path, default=root / "artifacts" / "v1_binary_study")
    result.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    result.add_argument("--workers", type=int, default=2)
    result.add_argument("--encoder-seed", type=int, default=2026)
    result.add_argument("--encoder-epochs", type=int, default=10)
    result.add_argument("--encoder-batch-size", type=int, default=128)
    result.add_argument("--encoder-lr", type=float, default=1e-3)
    result.add_argument("--eval-samples", type=int, default=2000)
    result.add_argument("--eval-batch-size", type=int, default=128)
    result.add_argument("--sample-seed", type=int, default=4242)
    result.add_argument("--sampling-steps", type=int, default=50)
    result.add_argument("--sampler", choices=("ddpm", "ddim"), default="ddpm")
    result.add_argument("--diffusion-steps", type=int, default=1000)
    result.add_argument("--variants", default="")
    result.add_argument("--resume", action="store_true", help="Reuse existing per-checkpoint metric files")
    result.add_argument("--overwrite", action="store_true")
    return result


def main() -> None:
    args = parser().parse_args()
    if args.command == "train-encoder":
        train_encoder(args)
    else:
        evaluate_suite(args)


if __name__ == "__main__":
    main()
