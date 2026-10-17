"""Dataclass-based configuration for each architecture.

Replaces the scattered constant blocks at the top of every notebook with one
typed config per architecture. Construct directly, override fields by keyword,
serialize to disk for reproducibility.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict
import json


# ---- Project-wide constants ---------------------------------------------------
SEED = 1337
DEFAULT_CORPUS = "data/tinyshakespeare.txt"


# ---- Training config (shared by all architectures) ---------------------------
@dataclass
class TrainConfig:
    batch_size: int = 64
    block_size: int = 16
    lr: float = 3e-3
    weight_decay: float = 0.01
    n_steps: int = 12000
    eval_every: int = 500
    eval_batches: int = 20
    seed: int = SEED


# ---- Per-architecture configs -------------------------------------------------
@dataclass
class TransformerConfig:
    """nb05/nb07b dense transformer (the baseline teacher candidate).

    Note: dropout default is 0.2, NOT 0.0. Tiny Shakespeare (~1MB) is small
    enough that any teacher with d_model > 128 will overfit catastrophically
    without dropout. If you set dropout=0.0, expect train→memorize, val→explode.
    """
    vocab_size: int = 128
    d_model: int = 32
    num_heads: int = 1
    n_layers: int = 2
    mlp_mult: int = 2
    dropout: float = 0.2


@dataclass
class MoEConfig:
    """nb09 sparse mixture-of-experts."""
    vocab_size: int = 128
    d_model: int = 32
    num_heads: int = 1
    n_layers: int = 2
    n_experts: int = 4
    expert_inner: int = 16
    dropout: float = 0.0
    lb_loss_weight: float = 0.01


@dataclass
class RWKVConfig:
    """nb10 linear-recurrence RWKV-style."""
    vocab_size: int = 128
    d_model: int = 32
    d_inner_cm: int = 64
    n_layers: int = 2


@dataclass
class HDCConfig:
    """nb11 Hebbian-trained HDC (random vocab, prototype sums)."""
    vocab_size: int = 128
    D: int = 1024
    T: int = 8
    vocab_seed: int = 0x57415A48   # 'WAZH'


@dataclass
class HDCRWKVConfig:
    """nb12c shipping architecture: bipolar HDC × RWKV recurrence."""
    vocab_size: int = 256
    d: int = 256
    n_layers: int = 1
    block_size: int = 16
    # Channel mixing not in shipping; off by default
    use_channel_mix: bool = False
    cm_inner: int = 64


@dataclass
class HDCRWKVHybridConfig:
    """Hybrid HDC-RWKV: binary recurrence + int8 prototype output.

    Breaks the BPC ~2.93 ceiling of pure-binary HDC-RWKV (F13 in findings.md)
    by relaxing the output projection to continuous (int8-deployable) values
    while keeping vocab + decay bipolar for cheap recurrence.

    Default deployment target: ESP32 flash (~150 KB at V=256, d=512).
    """
    vocab_size: int = 256
    d: int = 512
    n_layers: int = 1
    block_size: int = 64


@dataclass
class HDCRWKVContinuousDecayConfig:
    """HDC-RWKV with continuous decay + int8 prototype (F15 test).

    Tests whether the bipolar decay_mask is the actual bottleneck of binary
    HDC-RWKV. Vocab stays bipolar, decay becomes sigmoid-bounded continuous,
    prototype stays int8 (matching Tier 2.5).
    """
    vocab_size: int = 256
    d: int = 512
    n_layers: int = 1
    block_size: int = 64


@dataclass
class DistillationConfig:
    """Teacher → student knowledge distillation."""
    temperature: float = 4.0
    alpha_nll: float = 0.5         # weight on hard-target NLL
    alpha_distill: float = 0.5     # weight on soft-target KL


# ---- Serialization -----------------------------------------------------------
def save_config(cfg: Any, path: str | Path) -> None:
    Path(path).write_text(json.dumps(asdict(cfg), indent=2))


def load_config(cls: type, path: str | Path) -> Any:
    return cls(**json.loads(Path(path).read_text()))
