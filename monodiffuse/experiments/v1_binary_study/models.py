"""Parameter-compatible diffusion models for controlled binarization studies."""

from __future__ import annotations

import math
from dataclasses import dataclass

import torch
from torch import nn
from torch.nn import functional as F


class SignSTE(torch.autograd.Function):
    """Sign in the forward pass and a clipped identity gradient backward."""

    @staticmethod
    def forward(ctx, x: torch.Tensor) -> torch.Tensor:
        ctx.save_for_backward(x)
        return torch.where(x >= 0, torch.ones_like(x), -torch.ones_like(x))

    @staticmethod
    def backward(ctx, grad: torch.Tensor) -> torch.Tensor:
        (x,) = ctx.saved_tensors
        return grad * (x.abs() <= 1).to(grad.dtype)


class QuantConv2d(nn.Conv2d):
    """Conv2d whose forward precision can change without changing parameters.

    Full-precision and binary variants therefore have exactly matching state
    dictionaries, including biases. Binary inference uses one sign bit per
    weight and one floating-point scale per output channel.
    """

    def __init__(self, *args, binary: bool = False, centered: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self.binary = binary
        self.centered = centered

    def quantized_weight(self) -> torch.Tensor:
        if not self.binary:
            return self.weight
        latent = self.weight
        if self.centered:
            latent = latent - latent.mean(dim=(1, 2, 3), keepdim=True)
        scale = latent.abs().mean(dim=(1, 2, 3), keepdim=True).clamp_min(1e-8)
        binary = SignSTE.apply(latent) * scale
        # Keep gradients on the latent FP32 weights during native/QAT training.
        return (binary - self.weight).detach() + self.weight

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.conv2d(
            x,
            self.quantized_weight(),
            self.bias,
            self.stride,
            self.padding,
            self.dilation,
            self.groups,
        )


class BinaryActivation(nn.Module):
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return SignSTE.apply(x)


class SinusoidalTimeEmbedding(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        if dim % 2:
            raise ValueError("time embedding dimension must be even")
        self.dim = dim

    def forward(self, t: torch.Tensor) -> torch.Tensor:
        half = self.dim // 2
        frequencies = torch.exp(
            -math.log(10_000) * torch.arange(half, device=t.device) / (half - 1)
        )
        angles = t.float()[:, None] * frequencies[None]
        return torch.cat((angles.sin(), angles.cos()), dim=1)


def _groups(channels: int) -> int:
    for groups in (8, 4, 2, 1):
        if channels % groups == 0:
            return groups
    return 1


class ResidualBlock(nn.Module):
    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        time_dim: int,
        *,
        binary_weights: bool,
        centered: bool,
        binary_activations: bool,
        preactivation: bool,
    ):
        super().__init__()
        conv = lambda i, o, k, p=0: QuantConv2d(
            i,
            o,
            k,
            padding=p,
            bias=True,
            binary=binary_weights,
            centered=centered,
        )
        self.preactivation = preactivation
        self.norm1 = nn.GroupNorm(_groups(in_channels if preactivation else out_channels), in_channels if preactivation else out_channels)
        self.norm2 = nn.GroupNorm(_groups(out_channels), out_channels)
        self.act1 = BinaryActivation() if binary_activations else nn.SiLU()
        self.act2 = BinaryActivation() if binary_activations else nn.SiLU()
        self.conv1 = conv(in_channels, out_channels, 3, 1)
        self.conv2 = conv(out_channels, out_channels, 3, 1)
        self.skip = conv(in_channels, out_channels, 1) if in_channels != out_channels else nn.Identity()
        self.time = nn.Linear(time_dim, out_channels)

    def forward(self, x: torch.Tensor, time: torch.Tensor) -> torch.Tensor:
        if self.preactivation:
            h = self.conv1(self.act1(self.norm1(x)))
            h = h + self.time(time)[:, :, None, None]
            h = self.conv2(self.act2(self.norm2(h)))
        else:
            h = self.act1(self.norm1(self.conv1(x)))
            h = h + self.time(time)[:, :, None, None]
            h = self.act2(self.norm2(self.conv2(h)))
        return h + self.skip(x)


@dataclass(frozen=True)
class ModelConfig:
    image_channels: int = 1
    base_channels: int = 32
    time_dim: int = 64
    binary_weights: bool = False
    centered: bool = False
    binary_activations: bool = False
    preactivation: bool = True
    num_classes: int = 0


class BinaryDiffusionUNet(nn.Module):
    """Small U-Net shared exactly across all study conditions."""

    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        c = config.base_channels
        block_args = dict(
            time_dim=config.time_dim,
            binary_weights=config.binary_weights,
            centered=config.centered,
            binary_activations=config.binary_activations,
            preactivation=config.preactivation,
        )
        self.time_mlp = nn.Sequential(
            SinusoidalTimeEmbedding(config.time_dim),
            nn.Linear(config.time_dim, config.time_dim),
            nn.SiLU(),
            nn.Linear(config.time_dim, config.time_dim),
        )
        self.label_embedding = (
            nn.Embedding(config.num_classes, config.time_dim)
            if config.num_classes > 0
            else None
        )
        # Pixel-space boundary layers intentionally remain floating point.
        self.input = nn.Conv2d(config.image_channels, c, 3, padding=1)
        self.down1 = ResidualBlock(c, 2 * c, **block_args)
        self.down2 = ResidualBlock(2 * c, 4 * c, **block_args)
        self.middle = ResidualBlock(4 * c, 4 * c, **block_args)
        self.up1 = ResidualBlock(6 * c, 2 * c, **block_args)
        self.up2 = ResidualBlock(3 * c, c, **block_args)
        self.output_norm = nn.GroupNorm(_groups(c), c)
        self.output_act = nn.SiLU()
        self.output = nn.Conv2d(c, config.image_channels, 3, padding=1)

    def forward(
        self,
        x: torch.Tensor,
        t: torch.Tensor,
        labels: torch.Tensor | None = None,
    ) -> torch.Tensor:
        time = self.time_mlp(t)
        if self.label_embedding is not None:
            if labels is None:
                raise ValueError("class labels are required by this conditional model")
            time = time + self.label_embedding(labels)
        x0 = self.input(x)
        x1 = self.down1(F.avg_pool2d(x0, 2), time)
        x2 = self.down2(F.avg_pool2d(x1, 2), time)
        x2 = self.middle(x2, time)
        y1 = F.interpolate(x2, size=x1.shape[-2:], mode="nearest")
        y1 = self.up1(torch.cat((y1, x1), dim=1), time)
        y0 = F.interpolate(y1, size=x0.shape[-2:], mode="nearest")
        y0 = self.up2(torch.cat((y0, x0), dim=1), time)
        return self.output(self.output_act(self.output_norm(y0)))


def model_statistics(model: BinaryDiffusionUNet) -> dict[str, int | float]:
    total = sum(p.numel() for p in model.parameters())
    binary = sum(m.weight.numel() for m in model.modules() if isinstance(m, QuantConv2d) and m.binary)
    scales = sum(m.out_channels for m in model.modules() if isinstance(m, QuantConv2d) and m.binary)
    fp = total - binary
    packed_bytes = math.ceil(binary / 8) + 4 * (fp + scales)
    return {
        "parameters": total,
        "binary_weight_parameters": binary,
        "floating_point_parameters": fp,
        "binary_parameter_fraction": binary / total,
        "fp32_checkpoint_bytes_theoretical": 4 * total,
        "packed_inference_bytes_theoretical": packed_bytes,
    }
