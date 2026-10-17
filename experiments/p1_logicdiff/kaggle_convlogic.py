"""P2 — Convolutional logic-gate diffusion denoiser (self-contained, Kaggle-ready).

Why this exists: the P1 MLP logic denoiser failed because random all-to-all wiring has
no spatial locality, so it could only predict the average ink-map (speckle), never
denoise. This version uses CONVOLUTIONAL logic gates: each gate reads two taps from a
local KxK receptive field, with the gate choice shared across spatial positions
(translation weight-sharing) -- the inductive bias an image denoiser needs.

Everything is in one file so it pastes straight into a Kaggle notebook:

    !python kaggle_convlogic.py
    # or paste the file into a cell and call main()

Hidden compute is logic gates only (XNOR/popcount-class ops); the single sigmoid at the
output is the only arithmetic on the prediction side. Bernoulli bit-flip diffusion keeps
the state binary, so the gate network's native bit outputs ARE the target.

GO/NO-GO (the question P1 couldn't answer): with spatial locality, does the gate network
actually denoise -> low-t x0 accuracy >> background prior (~0.87) AND samples show real
digit strokes (not centered speckle)?
"""

import math
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.utils import save_image
from tqdm.auto import tqdm

# ----------------------------- config -----------------------------
CFG = dict(
    epochs=40,
    batch=128,
    lr=1e-2,
    T=256,
    widths=(128, 128, 128, 128, 128),   # logic channels per layer (capacity = #gates)
    dilations=(1, 1, 2, 4, 1),          # grow receptive field to ~digit scale
    k=3,
    t_ch=16,                            # timestep planes, re-injected each layer
    out_group=32,                       # final logic channels -> popcount -> per-pixel logit
    tau_start=1.0,                      # gate-softmax temperature at epoch 0
    tau_end=0.1,                        # ... annealed to here (sharpens -> closes hard gap)
    smoke=False,                        # True = tiny fast run to verify plumbing
)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
OUT = Path("results"); OUT.mkdir(exist_ok=True)


# ----------------------------- logic primitives -----------------------------
# Each of the 16 boolean functions is multilinear: f_i(a,b) = a0 + a1*a + a2*b + a3*ab.
# Stacking the coefficients lets a softmax-over-gates collapse to 4 numbers per channel,
# so we never materialize the (...,16) tensor -- ~4x less memory and compute.
#                       a0  a1  a2  a3      gate
GATE_COEFFS = torch.tensor([
    [0,  0,  0,  0],   # 0  FALSE
    [0,  0,  0,  1],   # 1  a AND b
    [0,  1,  0, -1],   # 2  a AND NOT b
    [0,  1,  0,  0],   # 3  a
    [0,  0,  1, -1],   # 4  NOT a AND b
    [0,  0,  1,  0],   # 5  b
    [0,  1,  1, -2],   # 6  XOR
    [0,  1,  1, -1],   # 7  OR
    [1, -1, -1,  1],   # 8  NOR
    [1, -1, -1,  2],   # 9  XNOR
    [1,  0, -1,  0],   # 10 NOT b
    [1,  0, -1,  1],   # 11 b IMPLIES a
    [1, -1,  0,  0],   # 12 NOT a
    [1, -1,  0,  1],   # 13 a IMPLIES b
    [1,  0,  0, -1],   # 14 NAND
    [1,  0,  0,  0],   # 15 TRUE
], dtype=torch.float32)


class ConvLogicLayer(nn.Module):
    """Convolutional logic gates: each output channel is a learned gate over two taps
    from a local KxK x C_in receptive field, shared across all spatial positions."""

    def __init__(self, c_in, c_out, k=3, dilation=1, seed=0):
        super().__init__()
        pad = dilation * (k // 2)               # 'same' padding for odd k
        self.unfold = nn.Unfold(kernel_size=k, dilation=dilation, padding=pad)
        n_taps = c_in * k * k
        g = torch.Generator().manual_seed(1234 + seed)
        self.register_buffer("ia", torch.randint(0, n_taps, (c_out,), generator=g))
        self.register_buffer("ib", torch.randint(0, n_taps, (c_out,), generator=g))
        self.register_buffer("M", GATE_COEFFS.clone())   # (16, 4)
        self.w = nn.Parameter(torch.randn(c_out, 16) * 0.1)
        self.c_out = c_out
        self.tau = 1.0                          # softmax temperature (annealed -> sharp)

    def forward(self, x, harden=False):
        B, _, H, W = x.shape
        patches = self.unfold(x)                # (B, C_in*k*k, H*W)
        a = patches[:, self.ia, :]              # (B, c_out, L)
        b = patches[:, self.ib, :]
        # Collapse the gate mixture to 4 coefficients per channel (a0 + a1*a + a2*b + a3*ab).
        # Lower tau -> sharper gate choice -> soft model converges to the hard (argmax) one.
        sel = self.M[self.w.argmax(-1)] if harden else F.softmax(self.w / self.tau, -1) @ self.M
        c0, c1, c2, c3 = (sel[:, i].view(1, -1, 1) for i in range(4))  # each (1, c_out, 1)
        out = c0 + c1 * a + c2 * b + c3 * (a * b)
        return out.view(B, self.c_out, H, W)


class ConvLogicDenoiser(nn.Module):
    """(noisy image bits, timestep) -> P(x0 == 1) per pixel, via convolutional gates."""

    def __init__(self, t_bits, t_ch=16, widths=(128,) * 5, dilations=(1, 1, 2, 4, 1),
                 k=3, out_group=32):
        super().__init__()
        self.t_bits, self.t_ch, self.out_group = t_bits, t_ch, out_group
        c = 1 + t_ch
        layers = []
        for i, (wd, dil) in enumerate(zip(widths, dilations)):
            layers.append(ConvLogicLayer(c, wd, k=k, dilation=dil, seed=i))
            c = wd + t_ch                       # re-inject timestep planes each layer
        self.layers = nn.ModuleList(layers)
        self.head = ConvLogicLayer(c, out_group, k=1, seed=99)

    def set_tau(self, tau):
        for layer in (*self.layers, self.head):
            layer.tau = tau

    def _t_planes(self, t_bits_enc, B, H, W):
        reps = (self.t_ch + self.t_bits - 1) // self.t_bits
        t = t_bits_enc.repeat(1, reps)[:, :self.t_ch]          # (B, t_ch)
        return t.view(B, self.t_ch, 1, 1).expand(B, self.t_ch, H, W)

    def forward(self, x_img, t_bits_enc, harden=False):
        B, _, H, W = x_img.shape
        tch = self._t_planes(t_bits_enc, B, H, W)
        h = torch.cat([x_img, tch], 1)
        for layer in self.layers:
            h = layer(h, harden=harden)
            h = torch.cat([h, tch], 1)
        h = self.head(h, harden=harden)                        # (B, out_group, H, W)
        logit = h.sum(1, keepdim=True) - self.out_group / 2    # soft popcount -> logit
        return torch.sigmoid(logit).view(B, H * W)


def timestep_to_bits(t, n_bits):
    ar = torch.arange(n_bits, device=t.device)
    return ((t.unsqueeze(-1) >> ar) & 1).float()


# ----------------------------- Bernoulli bit-flip diffusion -----------------------------
class BernoulliBitFlip:
    def __init__(self, T=256, b0=1e-3, b1=0.45, device="cpu"):
        betas = torch.linspace(b0, b1, T, device=device)
        k = torch.cumprod(1 - 2 * betas, 0)
        self.T, self.betas, self.p, self.device = T, betas, (1 - k) / 2, device

    def q_sample(self, x0, t):
        flip = (torch.rand_like(x0) < self.p[t].unsqueeze(-1)).float()
        return (x0 + flip) % 2

    @torch.no_grad()
    def posterior_sample(self, xt, x0, t):
        beta = self.betas[t].unsqueeze(-1)
        p_prev = self.p[(t - 1).clamp(min=0)].unsqueeze(-1)
        L1 = torch.where(xt == 1, 1 - beta, beta); L0 = torch.where(xt == 0, 1 - beta, beta)
        P1 = torch.where(x0 == 1, 1 - p_prev, p_prev); P0 = torch.where(x0 == 0, 1 - p_prev, p_prev)
        prob1 = (L1 * P1) / (L1 * P1 + L0 * P0 + 1e-12)
        return (torch.rand_like(prob1) < prob1).float()

    @torch.no_grad()
    def sample(self, model, n, t_bits, H=28, harden=False):
        x = (torch.rand(n, H * H, device=self.device) < 0.5).float()
        for ti in reversed(range(self.T)):
            t = torch.full((n,), ti, device=self.device, dtype=torch.long)
            probs = model(x.view(n, 1, H, H), timestep_to_bits(t, t_bits), harden=harden)
            x0 = (torch.rand_like(probs) < probs).float()
            x = x0 if ti == 0 else self.posterior_sample(x, x0, t)
        return x


# ----------------------------- data / eval -----------------------------
def load_mnist(batch, smoke):
    datasets.MNIST.mirrors = (
        ["https://storage.googleapis.com/cvdf-datasets/mnist/"] + datasets.MNIST.mirrors)
    tf = transforms.ToTensor()
    tr = datasets.MNIST("data", train=True, download=True, transform=tf)
    te = datasets.MNIST("data", train=False, download=True, transform=tf)
    if smoke:
        tr = torch.utils.data.Subset(tr, range(3000))
    return (DataLoader(tr, batch, shuffle=True, drop_last=True),
            DataLoader(te, 512, shuffle=True))


def binarize(x):
    return (x.view(x.size(0), -1) > 0.5).float()


@torch.no_grad()
def accuracy_table(model, diff, dl_te, t_bits):
    x0 = binarize(next(iter(dl_te))[0].to(DEVICE))
    rows = {}
    for ti in sorted({int(f * (diff.T - 1)) for f in (0.03, 0.25, 0.5, 0.78, 0.99)}):
        t = torch.full((x0.size(0),), ti, device=DEVICE, dtype=torch.long)
        xt = diff.q_sample(x0, t)
        tb = timestep_to_bits(t, t_bits)
        soft = ((model(xt.view(-1, 1, 28, 28), tb) > 0.5).float() == x0).float().mean().item()
        hard = ((model(xt.view(-1, 1, 28, 28), tb, harden=True) > 0.5).float() == x0).float().mean().item()
        rows[ti] = (soft, hard)
    return rows


# ----------------------------- train -----------------------------
def main(cfg=CFG):
    if cfg["smoke"]:
        cfg = {**cfg, "epochs": 2, "T": 64}
    t_bits = max(1, (cfg["T"] - 1).bit_length())
    print(f"[P2] device={DEVICE} T={cfg['T']} widths={cfg['widths']} "
          f"dilations={cfg['dilations']} epochs={cfg['epochs']}")

    dl_tr, dl_te = load_mnist(cfg["batch"], cfg["smoke"])
    diff = BernoulliBitFlip(T=cfg["T"], device=DEVICE)
    model = ConvLogicDenoiser(t_bits, cfg["t_ch"], cfg["widths"], cfg["dilations"],
                              cfg["k"], cfg["out_group"]).to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=cfg["lr"])
    print(f"[P2] learnable gate-logit params: {sum(p.numel() for p in model.parameters()):,}")

    for ep in range(cfg["epochs"]):
        # Anneal gate-softmax temperature high->low so the soft model converges to hard.
        frac = ep / max(1, cfg["epochs"] - 1)
        tau = cfg["tau_start"] * (cfg["tau_end"] / cfg["tau_start"]) ** frac
        model.set_tau(tau)
        model.train(); run = 0.0
        bar = tqdm(dl_tr, desc=f"ep {ep + 1}/{cfg['epochs']} tau={tau:.2f}", leave=False)
        for x, _ in bar:
            x0 = binarize(x.to(DEVICE))
            t = torch.randint(0, cfg["T"], (x0.size(0),), device=DEVICE)
            xt = diff.q_sample(x0, t).view(-1, 1, 28, 28)
            pred = model(xt, timestep_to_bits(t, t_bits))
            loss = F.binary_cross_entropy(pred, x0)
            opt.zero_grad(); loss.backward(); opt.step()
            run += loss.item(); bar.set_postfix(bce=f"{loss.item():.4f}")
        print(f"[P2] epoch {ep + 1}/{cfg['epochs']}  tau={tau:.3f}  bce={run / len(dl_tr):.4f}", flush=True)
        if (ep + 1) % max(1, cfg["epochs"] // 8) == 0 or ep == cfg["epochs"] - 1:
            model.eval()
            s = diff.sample(model, 64, t_bits).view(64, 1, 28, 28)
            save_image(s, str(OUT / f"p2_samples_ep{ep + 1:03d}.png"), nrow=8)
            print(f"   saved p2_samples_ep{ep + 1:03d}.png  (pixel-on {s.mean():.3f}, data ~0.13)", flush=True)

    print("\n==== P2 GO/NO-GO ====")
    for ti, (s, h) in accuracy_table(model, diff, dl_te, t_bits).items():
        print(f"  t={ti:>4}:  soft {s:.3f}   hard {h:.3f}")
    print("\n  PASS if low-t accuracy is WELL above 0.87 (e.g. >0.95) AND the curve")
    print("  DROPS as t grows (real denoising), and samples show digit strokes.")
    print("  Flat ~0.87 again => conv-logic also can't denoise; time to rethink.")


if __name__ == "__main__":
    main()
