"""P1 feasibility: can a differentiable logic-gate network run a diffusion?

Trains a LogicDenoiser with Bernoulli bit-flip diffusion on binarized MNIST, then
runs the go/no-go checks (see README). Run from anywhere:

    python experiments/p1_logicdiff/train.py            # full-ish run
    python experiments/p1_logicdiff/train.py --quick    # fast smoke test

The single question this answers: does a gate network denoise well enough to
generate recognizable digits from absolute noise? If yes -> the paper is viable.
"""

import argparse
import sys
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.utils import save_image

sys.path.insert(0, str(Path(__file__).resolve().parent))  # local imports
from model import LogicDenoiser, timestep_to_bits
from diffusion import BernoulliBitFlip

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RESULTS = ROOT / "results"
RESULTS.mkdir(exist_ok=True)


def get_args():
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=128)
    p.add_argument("--lr", type=float, default=1e-2)
    p.add_argument("--T", type=int, default=256)
    p.add_argument("--depth", type=int, default=5)
    p.add_argument("--group", type=int, default=8)      # width = 784 * group
    p.add_argument("--t_rep", type=int, default=32)     # timestep-bit replication
    p.add_argument("--tau", type=float, default=1.0)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--quick", action="store_true", help="tiny run to verify plumbing")
    return p.parse_args()


def load_bits(batch, quick):
    # The default LeCun URL is often 404 and the S3 fallback is slow; prefer the
    # fast/reliable Google CVDF mirror, keeping the originals as fallback.
    datasets.MNIST.mirrors = (
        ["https://storage.googleapis.com/cvdf-datasets/mnist/"] + datasets.MNIST.mirrors
    )
    tf = transforms.Compose([transforms.ToTensor()])  # [0,1]
    train = datasets.MNIST(str(DATA), train=True, download=True, transform=tf)
    test = datasets.MNIST(str(DATA), train=False, download=True, transform=tf)
    if quick:  # subset for a fast smoke test
        train = torch.utils.data.Subset(train, range(2000))
    dl_tr = DataLoader(train, batch_size=batch, shuffle=True, drop_last=True)
    dl_te = DataLoader(test, batch_size=512, shuffle=True)
    return dl_tr, dl_te


def binarize(x):
    return (x.view(x.size(0), -1) > 0.5).float()       # (B,784) bits


@torch.no_grad()
def denoise_accuracy(model, diff, dl_te, t_bits, device):
    """x0-prediction accuracy at several noise levels, soft and hardened (gate gap)."""
    x0 = binarize(next(iter(dl_te))[0].to(device))
    # Bins scale with the schedule length so this works for any T (incl. --quick).
    bins = sorted({int(f * (diff.T - 1)) for f in (0.03, 0.25, 0.5, 0.78, 0.99)})
    out = {}
    for ti in bins:
        t = torch.full((x0.size(0),), ti, device=device, dtype=torch.long)
        xt = diff.q_sample(x0, t)
        tb = timestep_to_bits(t, t_bits)
        soft = ((model(xt, tb) > 0.5).float() == x0).float().mean().item()
        hard = ((model(xt, tb, harden=True) > 0.5).float() == x0).float().mean().item()
        out[ti] = (soft, hard)
    return out


def main():
    args = get_args()
    if args.quick:
        args.epochs, args.T = 2, 64
    dev = args.device
    t_bits = max(1, (args.T - 1).bit_length())
    print(f"[P1] device={dev}  T={args.T}  t_bits={t_bits}  depth={args.depth}  "
          f"width={784 * args.group}  epochs={args.epochs}")

    dl_tr, dl_te = load_bits(args.batch, args.quick)
    diff = BernoulliBitFlip(T=args.T, device=dev)
    model = LogicDenoiser(img_dim=784, t_bits=t_bits, t_rep=args.t_rep, group=args.group,
                          depth=args.depth, tau=args.tau).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[P1] gate-logit params: {n_params:,}")

    for ep in range(args.epochs):
        model.train()
        running = 0.0
        for x, _ in dl_tr:
            x0 = binarize(x.to(dev))
            t = torch.randint(0, args.T, (x0.size(0),), device=dev)
            xt = diff.q_sample(x0, t)
            pred = model(xt, timestep_to_bits(t, t_bits))
            loss = F.binary_cross_entropy(pred, x0)
            opt.zero_grad(); loss.backward(); opt.step()
            running += loss.item()
        print(f"[P1] epoch {ep + 1}/{args.epochs}  bce={running / len(dl_tr):.4f}")

        if (ep + 1) % max(1, args.epochs // 5) == 0 or ep == args.epochs - 1:
            model.eval()
            samples = diff.sample(model, 64, 784, t_bits).view(64, 1, 28, 28)
            grid = RESULTS / f"p1_samples_ep{ep + 1:03d}.png"
            save_image(samples, str(grid), nrow=8)
            print(f"[P1] saved {grid.name}  (pixel-on rate {samples.mean():.3f}, "
                  f"data ~0.13)")

    # ---- go / no-go report ----
    print("\n==== P1 GO/NO-GO ====")
    acc = denoise_accuracy(model, diff, dl_te, t_bits, dev)
    print("x0-prediction accuracy by timestep (soft / hardened-gates):")
    for ti, (s, h) in acc.items():
        print(f"  t={ti:>4}:  soft {s:.3f}   hard {h:.3f}")
    print("\nInterpret:")
    print("  PASS if low-t accuracy is high (>0.9) AND samples are visibly digit-like.")
    print("  The soft-vs-hard gap previews the DLGN discretization gap (P2 concern).")
    print(f"  Inspect the latest grid in {RESULTS}/p1_samples_*.png")


if __name__ == "__main__":
    main()
