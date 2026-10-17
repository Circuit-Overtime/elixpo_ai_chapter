"""Generic training loop with best-val checkpoint and dual soft/hard evaluation.

Replaces the ~30 lines of training boilerplate copy-pasted across every notebook.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Tuple

import torch

from .config import TrainConfig
from .data import make_batch
from .utils import log_info


def train(
    model: torch.nn.Module,
    train_data: torch.Tensor,
    val_data: torch.Tensor,
    cfg: TrainConfig,
    device: str = "cpu",
    extra_loss_fn: Callable | None = None,
    eval_hard: bool = False,
) -> Tuple[List[Tuple[int, float, float, float]], Dict]:
    """Train `model` with AdamW + best-val checkpointing.

    Args:
        model:        any nn.Module whose forward(idx, targets) returns (logits, loss)
                      or (logits, (ce, aux), ...)
        train_data:   1D long tensor of token IDs
        val_data:     1D long tensor of token IDs
        cfg:          TrainConfig
        extra_loss_fn: optional fn(model, x, y) -> additional scalar to add to loss.
                      Used by distillation (KL with teacher).
        eval_hard:    if True and model has forward_hard, log a HARD val column too

    Returns:
        history:    list of (step, train_loss, val_loss_soft, val_loss_hard or 0)
        best:       dict with {'val': best_val, 'state': state_dict, 'step': step}
    """
    opt = torch.optim.AdamW(
        model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
    )
    history: List[Tuple[int, float, float, float]] = []
    best = {"val": float("inf"), "state": None, "step": 0}

    @torch.no_grad()
    def _eval_split(data: torch.Tensor, use_hard: bool) -> float:
        model.eval()
        losses = torch.zeros(cfg.eval_batches)
        for k in range(cfg.eval_batches):
            xb, yb = make_batch(data, cfg.batch_size, cfg.block_size, device)
            if use_hard and hasattr(model, "forward_hard"):
                _, loss = model.forward_hard(xb, yb)
            else:
                out = model(xb, yb)
                # Models return (logits, loss) or (logits, (ce, aux), ...)
                loss = out[1] if len(out) >= 2 else out[0]
                if isinstance(loss, tuple):
                    loss = loss[0]
            losses[k] = loss.item()
        model.train()
        return losses.mean().item()

    for step in range(cfg.n_steps + 1):
        if step % cfg.eval_every == 0:
            v_soft = _eval_split(val_data, use_hard=False)
            v_hard = _eval_split(val_data, use_hard=True) if eval_hard else 0.0
            t_loss = _eval_split(train_data, use_hard=False)
            history.append((step, t_loss, v_soft, v_hard))
            target = v_hard if eval_hard else v_soft
            marker = ""
            if target < best["val"]:
                best["val"] = target
                best["state"] = {k: v.detach().clone() for k, v in model.state_dict().items()}
                best["step"] = step
                marker = "  <-- best"
            if eval_hard:
                log_info(
                    f"step {step:>5} | train {t_loss:.4f} | val(soft) {v_soft:.4f} "
                    f"| val(hard) {v_hard:.4f}{marker}"
                )
            else:
                log_info(f"step {step:>5} | train {t_loss:.4f} | val {v_soft:.4f}{marker}")

        xb, yb = make_batch(train_data, cfg.batch_size, cfg.block_size, device)
        out = model(xb, yb)
        loss = out[1] if len(out) >= 2 else out[0]
        if isinstance(loss, tuple):
            ce, aux = loss
            loss = ce + 0.01 * aux  # generic MoE-style aux weight; override via extra_loss_fn
        if extra_loss_fn is not None:
            loss = loss + extra_loss_fn(model, xb, yb)

        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()

    if best["state"] is not None:
        model.load_state_dict(best["state"])
    return history, best
