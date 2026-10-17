"""Knowledge distillation: teacher (large transformer) → student (HDC-RWKV).

The KL term lets the student mimic the teacher's full output distribution, not
just its argmax. Standard Hinton et al. 2015 recipe, applied here to a binary
recurrent student for the first time at the sub-1MB scale.

Loss:
    L = α_nll * NLL(student, true)
      + α_distill * T² * KL( student/T  ‖  teacher/T )

The T² factor preserves gradient magnitude relative to the NLL term as
temperature changes (the standard Hinton scaling).
"""
from __future__ import annotations

from typing import Tuple

import torch
import torch.nn.functional as F

from .config import DistillationConfig, TrainConfig
from .data import make_batch
from .utils import log_info


def distill_step(
    student: torch.nn.Module,
    teacher: torch.nn.Module,
    x: torch.Tensor,
    y: torch.Tensor,
    dist_cfg: DistillationConfig,
) -> Tuple[torch.Tensor, dict]:
    """One distillation forward + loss. Teacher is frozen.

    Returns (loss, info_dict).
    """
    # Teacher logits — frozen, no gradients
    with torch.no_grad():
        teacher_out = teacher(x)
        teacher_logits = teacher_out[0] if isinstance(teacher_out, tuple) else teacher_out

    # Student logits — gradients flow
    student_out = student(x, y)
    student_logits = student_out[0]
    nll = student_out[1] if isinstance(student_out, tuple) else None
    if isinstance(nll, tuple):
        nll = nll[0]

    if nll is None:
        # Models that don't return loss (some forward signatures): compute it explicitly
        B, T, V = student_logits.shape
        nll = F.cross_entropy(student_logits.view(B * T, V), y.view(B * T))

    # Soft KL distillation
    T_ = dist_cfg.temperature
    teacher_log_probs = F.log_softmax(teacher_logits / T_, dim=-1)
    student_log_probs = F.log_softmax(student_logits / T_, dim=-1)
    # KL(student ‖ teacher) — student's distribution should be close to teacher's
    teacher_probs = teacher_log_probs.exp()
    kl = F.kl_div(student_log_probs, teacher_probs, reduction="batchmean") * (T_ ** 2)

    loss = dist_cfg.alpha_nll * nll + dist_cfg.alpha_distill * kl
    info = {"nll": nll.item(), "kl": kl.item(), "loss": loss.item()}
    return loss, info


def train_with_distillation(
    student: torch.nn.Module,
    teacher: torch.nn.Module,
    train_data: torch.Tensor,
    val_data: torch.Tensor,
    train_cfg: TrainConfig,
    dist_cfg: DistillationConfig,
    device: str = "cpu",
    eval_hard: bool = True,
):
    """Train student against teacher's soft targets + hard targets.

    Teacher is set to eval mode and frozen. Student is trained normally.
    Best-val checkpointing on student's deployment-mode hard val loss.
    """
    teacher.eval()
    for p in teacher.parameters():
        p.requires_grad_(False)

    opt = torch.optim.AdamW(
        student.parameters(), lr=train_cfg.lr, weight_decay=train_cfg.weight_decay
    )
    history = []
    best = {"val": float("inf"), "state": None, "step": 0}

    @torch.no_grad()
    def _eval_split(data: torch.Tensor, use_hard: bool) -> float:
        student.eval()
        losses = torch.zeros(train_cfg.eval_batches)
        for k in range(train_cfg.eval_batches):
            xb, yb = make_batch(data, train_cfg.batch_size, train_cfg.block_size, device)
            if use_hard and hasattr(student, "forward_hard"):
                _, loss = student.forward_hard(xb, yb)
            else:
                out = student(xb, yb)
                loss = out[1]
                if isinstance(loss, tuple):
                    loss = loss[0]
            losses[k] = loss.item()
        student.train()
        return losses.mean().item()

    for step in range(train_cfg.n_steps + 1):
        if step % train_cfg.eval_every == 0:
            v_soft = _eval_split(val_data, use_hard=False)
            v_hard = _eval_split(val_data, use_hard=True) if eval_hard else 0.0
            history.append((step, v_soft, v_hard))
            target = v_hard if eval_hard else v_soft
            marker = ""
            if target < best["val"]:
                best["val"] = target
                best["state"] = {
                    k: v.detach().clone() for k, v in student.state_dict().items()
                }
                best["step"] = step
                marker = "  <-- best"
            if eval_hard:
                log_info(
                    f"step {step:>5} | val(soft) {v_soft:.4f} | val(hard) {v_hard:.4f}{marker}"
                )
            else:
                log_info(f"step {step:>5} | val {v_soft:.4f}{marker}")

        xb, yb = make_batch(train_data, train_cfg.batch_size, train_cfg.block_size, device)
        loss, info = distill_step(student, teacher, xb, yb, dist_cfg)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()

    if best["state"] is not None:
        student.load_state_dict(best["state"])
    return history, best
