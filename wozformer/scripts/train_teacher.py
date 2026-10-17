"""Train the teacher transformer on Tiny Shakespeare.

The teacher is a dense transformer at full fp32 precision.  Its only purpose
is to provide soft targets for student distillation.  Once trained, it never
runs at deployment — it lives only in the training pipeline.

Usage:
    python scripts/train_teacher.py
    python scripts/train_teacher.py --steps 5000 --d 128

Outputs:
    runs/teacher.pt        teacher checkpoint (model + tokenizer + history)
    runs/bpe_512.json      shared BPE tokenizer the student will reuse
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
    p.add_argument("--vocab",  type=int, default=512)
    p.add_argument("--d",      type=int, default=256)
    p.add_argument("--heads",  type=int, default=4)
    p.add_argument("--layers", type=int, default=4)
    p.add_argument("--mlp",    type=int, default=4)
    p.add_argument("--block",  type=int, default=64)
    p.add_argument("--batch",  type=int, default=64)
    p.add_argument("--lr",     type=float, default=3e-4)
    p.add_argument("--steps",  type=int, default=6000)
    p.add_argument("--eval-every", type=int, default=500)
    p.add_argument("--seed",   type=int, default=1337)
    p.add_argument("--out",    default="runs/teacher.pt")
    p.add_argument("--bpe-out", default="runs/bpe.json")
    args = p.parse_args()

    wz.utils.set_seed(args.seed)
    device = wz.utils.get_device()
    wz.utils.log_info(f"Device: {device}")

    # ----- corpus + tokenizer ----------------------------------------------
    text = wz.data.load_corpus(args.corpus)
    tok = wz.tokenizer.BPETokenizer.train(text, vocab_size=args.vocab)
    Path(args.bpe_out).parent.mkdir(parents=True, exist_ok=True)
    tok.save(args.bpe_out)
    wz.utils.log_info(f"Saved tokenizer → {args.bpe_out}")

    ids = torch.tensor(tok.encode(text), dtype=torch.long)
    train_data, val_data = wz.data.split_train_val(ids, val_fraction=0.1)
    wz.utils.log_info(f"Corpus: {len(ids):,} tokens (train {len(train_data):,} / val {len(val_data):,})")

    # ----- model ------------------------------------------------------------
    tcfg = wz.config.TransformerConfig(
        vocab_size=args.vocab,
        d_model=args.d,
        num_heads=args.heads,
        n_layers=args.layers,
        mlp_mult=args.mlp,
    )
    teacher = wz.models.TinyTransformer(tcfg, block_size=args.block).to(device)
    n_params = wz.utils.count_params(teacher)
    wz.utils.log_info(f"Teacher: {n_params:,} params")

    # ----- training ---------------------------------------------------------
    train_cfg = wz.config.TrainConfig(
        batch_size=args.batch,
        block_size=args.block,
        lr=args.lr,
        n_steps=args.steps,
        eval_every=args.eval_every,
        seed=args.seed,
    )
    history, best = wz.trainer.train(teacher, train_data, val_data, train_cfg, device=device)

    # ----- save -------------------------------------------------------------
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "config": {
                "vocab_size": args.vocab, "d_model": args.d, "num_heads": args.heads,
                "n_layers": args.layers, "mlp_mult": args.mlp, "block_size": args.block,
            },
            "model_state": teacher.state_dict(),
            "history": history,
            "best_val": best["val"],
            "best_step": best["step"],
            "n_params": n_params,
        },
        args.out,
    )
    wz.utils.log_info(f"Saved teacher → {args.out}  (best val {best['val']:.4f} at step {best['step']})")


if __name__ == "__main__":
    main()
