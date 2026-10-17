"""Side-by-side evaluation of teacher vs student(s).

Loads any combination of: teacher.pt, student.pt (distilled), student_no_distill.pt
Reports:
  - val nats/token + BPC
  - parameter and byte counts
  - 3 generated samples per model at fixed seeds (reproducible)

Usage:
    python scripts/compare.py
    python scripts/compare.py --include teacher student student_baseline
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import torch

import wozformer as wz


def _load_model(path: str, device: str):
    ck = torch.load(path, map_location=device, weights_only=False)
    cfg = ck["config"]
    # Heuristic on which architecture the .pt holds
    if "d_model" in cfg:  # transformer (teacher)
        tcfg = wz.config.TransformerConfig(
            vocab_size=cfg["vocab_size"], d_model=cfg["d_model"], num_heads=cfg["num_heads"],
            n_layers=cfg["n_layers"], mlp_mult=cfg["mlp_mult"],
        )
        m = wz.models.TinyTransformer(tcfg, block_size=cfg["block_size"]).to(device)
        m.load_state_dict(ck["model_state"])
        return m, ck, "transformer", cfg["block_size"]
    if "d" in cfg:  # HDC-RWKV student
        scfg = wz.config.HDCRWKVConfig(
            vocab_size=cfg["vocab_size"], d=cfg["d"], n_layers=cfg["n_layers"],
            block_size=cfg["block_size"],
        )
        m = wz.models.HDCRWKV(scfg).to(device)
        m.load_state_dict(ck["model_state"])
        return m, ck, "hdc_rwkv", cfg["block_size"]
    raise ValueError(f"unknown config schema in {path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bpe", default="runs/bpe.json")
    p.add_argument("--corpus", default="data/tinyshakespeare.txt")
    p.add_argument("--paths", nargs="+", default=["runs/teacher.pt", "runs/student.pt"])
    p.add_argument("--n-eval-batches", type=int, default=40)
    p.add_argument("--prompts", nargs="+",
                   default=["king", "romeo", "my lord,"])
    args = p.parse_args()

    device = wz.utils.get_device()
    tok = wz.tokenizer.BPETokenizer.load(args.bpe)
    text = wz.data.load_corpus(args.corpus)
    ids = torch.tensor(tok.encode(text), dtype=torch.long)
    _, val_data = wz.data.split_train_val(ids)

    # Sample average chars per token (for BPC conversion)
    sample = val_data[:5000].tolist()
    avg_cpt = wz.metrics.avg_chars_per_token(tok, sample)
    print(f"\navg chars per token (val): {avg_cpt:.2f}\n")

    rows = []
    for path in args.paths:
        if not Path(path).exists():
            print(f"[skip] {path} does not exist")
            continue
        m, ck, kind, block = _load_model(path, device)
        # Evaluate (use hard forward for HDC-RWKV)
        use_hard = (kind == "hdc_rwkv")
        nats = wz.metrics.eval_loss(
            m, val_data, batch_size=32, block_size=block,
            n_batches=args.n_eval_batches, device=device, use_hard=use_hard,
        )
        bpc = wz.metrics.bits_per_char(nats, avg_cpt)
        n_params = wz.utils.count_params(m)
        deploy = ck.get("deploy_bytes")
        rows.append({
            "path": path, "kind": kind, "params": n_params,
            "deploy_bytes": deploy, "nats": nats, "bpc": bpc, "block": block,
            "model": m,
        })

    # ----- table ------------------------------------------------------------
    print(f"{'path':<28} {'kind':<10} {'params':>10} {'deploy':>10} {'nats':>8} {'BPC':>8}")
    print("-" * 80)
    for r in rows:
        deploy = f"{r['deploy_bytes']:>10,}" if r["deploy_bytes"] else " " * 10
        print(f"{r['path']:<28} {r['kind']:<10} {r['params']:>10,} {deploy} {r['nats']:>8.4f} {r['bpc']:>8.4f}")
    print()

    # ----- samples ----------------------------------------------------------
    seeds = [1337, 42, 7]
    for prompt, seed in zip(args.prompts, seeds):
        print(f"\n=== prompt: {prompt!r}   seed={seed} ===")
        for r in rows:
            try:
                out = wz.generate.generate(
                    r["model"], tok, prompt=prompt, max_new_tokens=80,
                    block_size=r["block"], temperature=0.6, top_k=5, seed=seed,
                    device=device, use_hard=(r["kind"] == "hdc_rwkv"),
                )
                print(f"--- {Path(r['path']).stem} ---")
                print(out)
            except Exception as exc:
                print(f"--- {Path(r['path']).stem} FAILED: {exc} ---")


if __name__ == "__main__":
    main()
