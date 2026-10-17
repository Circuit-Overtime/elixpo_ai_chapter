"""Train the HDC-RWKV student with knowledge distillation from the teacher.

The student is bipolar (binary weights via STE) and is the model that gets
shipped to the 6502 / ESP32.  Distillation lets it inherit some of the teacher's
quality despite being ~20× smaller.

Usage:
    python scripts/train_student.py
    python scripts/train_student.py --d 1024 --vocab 512 --layers 2
    python scripts/train_student.py --no-distill   # ablation: NLL only

Outputs:
    runs/student.pt        student checkpoint
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

import wozformer as wz


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--corpus", default="data/tinyshakespeare.txt")
    p.add_argument("--teacher", default="runs/teacher.pt")
    p.add_argument("--bpe",     default="runs/bpe.json")
    p.add_argument("--vocab",   type=int, default=512)
    p.add_argument("--d",       type=int, default=1024)
    p.add_argument("--layers",  type=int, default=2)
    p.add_argument("--block",   type=int, default=64)
    p.add_argument("--batch",   type=int, default=32)
    p.add_argument("--lr",      type=float, default=3e-3)
    p.add_argument("--steps",   type=int, default=12000)
    p.add_argument("--eval-every", type=int, default=500)
    p.add_argument("--seed",    type=int, default=1337)
    p.add_argument("--temp",    type=float, default=4.0,  help="distillation temperature")
    p.add_argument("--alpha-nll",     type=float, default=0.3)
    p.add_argument("--alpha-distill", type=float, default=0.7)
    p.add_argument("--no-distill", action="store_true", help="ablation: NLL only, no teacher")
    p.add_argument("--out", default="runs/student.pt")
    args = p.parse_args()

    wz.utils.set_seed(args.seed)
    device = wz.utils.get_device()
    wz.utils.log_info(f"Device: {device}")

    # ----- tokenizer + corpus ----------------------------------------------
    tok = wz.tokenizer.BPETokenizer.load(args.bpe)
    text = wz.data.load_corpus(args.corpus)
    ids = torch.tensor(tok.encode(text), dtype=torch.long)
    train_data, val_data = wz.data.split_train_val(ids)
    wz.utils.log_info(f"Loaded BPE (vocab={tok.vocab_size}), corpus has {len(ids):,} tokens")

    # ----- student ----------------------------------------------------------
    scfg = wz.config.HDCRWKVConfig(
        vocab_size=args.vocab,
        d=args.d,
        n_layers=args.layers,
        block_size=args.block,
    )
    student = wz.models.HDCRWKV(scfg).to(device)
    wz.utils.log_info(
        f"Student: {wz.utils.count_params(student):,} train params"
        f" | deploy bytes: {student.deployment_bytes():,}"
    )

    # ----- training ---------------------------------------------------------
    train_cfg = wz.config.TrainConfig(
        batch_size=args.batch,
        block_size=args.block,
        lr=args.lr,
        n_steps=args.steps,
        eval_every=args.eval_every,
        seed=args.seed,
    )

    if args.no_distill:
        wz.utils.log_info("ABLATION: training student with NLL only (no teacher)")
        history, best = wz.trainer.train(
            student, train_data, val_data, train_cfg, device=device, eval_hard=True
        )
        teacher_info = None
    else:
        # Load teacher
        wz.utils.log_info(f"Loading teacher from {args.teacher}")
        ck = torch.load(args.teacher, map_location=device, weights_only=False)
        tcfg = wz.config.TransformerConfig(
            vocab_size=ck["config"]["vocab_size"],
            d_model=ck["config"]["d_model"],
            num_heads=ck["config"]["num_heads"],
            n_layers=ck["config"]["n_layers"],
            mlp_mult=ck["config"]["mlp_mult"],
        )
        teacher = wz.models.TinyTransformer(tcfg, block_size=ck["config"]["block_size"]).to(device)
        teacher.load_state_dict(ck["model_state"])
        teacher.eval()

        dcfg = wz.config.DistillationConfig(
            temperature=args.temp,
            alpha_nll=args.alpha_nll,
            alpha_distill=args.alpha_distill,
        )
        wz.utils.log_info(
            f"Distillation: T={dcfg.temperature}, α_nll={dcfg.alpha_nll}, α_distill={dcfg.alpha_distill}"
        )
        history, best = wz.distillation.train_with_distillation(
            student, teacher, train_data, val_data, train_cfg, dcfg, device=device, eval_hard=True
        )
        teacher_info = {
            "path": args.teacher,
            "best_val": ck.get("best_val"),
            "n_params": ck.get("n_params"),
        }

    # ----- save -------------------------------------------------------------
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "config": {
                "vocab_size": args.vocab, "d": args.d, "n_layers": args.layers,
                "block_size": args.block,
            },
            "model_state": student.state_dict(),
            "history": history,
            "best_val_hard": best["val"],
            "best_step": best["step"],
            "n_train_params": wz.utils.count_params(student),
            "deploy_bytes": student.deployment_bytes(),
            "distilled": not args.no_distill,
            "teacher": teacher_info,
        },
        args.out,
    )
    wz.utils.log_info(
        f"Saved student → {args.out}  (best HARD val {best['val']:.4f} at step {best['step']})"
    )


if __name__ == "__main__":
    main()
