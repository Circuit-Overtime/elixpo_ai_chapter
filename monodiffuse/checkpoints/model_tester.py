import torch
import math
from torchvision.utils import save_image
import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torch.amp import GradScaler, autocast
from tqdm.notebook import tqdm
import matplotlib.pyplot as plt
from scipy.spatial.distance import cdist
from scipy.linalg import sqrtm
from pathlib import Path

# =======================
# CONFIG
# =======================
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_QUANT = 1   # set to 1 or 16
N_SAMPLES = 16
HERE = Path(__file__).resolve().parent          # checkpoints/
ROOT = HERE.parent                              # repo root
(ROOT / "results").mkdir(exist_ok=True)
SAVE_PATH = str(ROOT / "results" / "generated.png")

class SinusoidalPositionEmbeddings(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.dim = dim
    def forward(self, time):
        device = time.device
        half_dim = self.dim // 2
        embeddings = math.log(10000) / (half_dim - 1)
        embeddings = torch.exp(torch.arange(half_dim, device=device) * -embeddings)
        embeddings = time[:, None] * embeddings[None, :]
        embeddings = torch.cat((embeddings.sin(), embeddings.cos()), dim=-1)
        return embeddings

# --- 16-BIT ---
class ResBlock16(nn.Module):
    def __init__(self, in_ch, out_ch, time_emb_dim, up=False):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        if up:
            self.conv1 = nn.Conv2d(2*in_ch, out_ch, 3, padding=1)
            self.transform = nn.ConvTranspose2d(out_ch, out_ch, 4, 2, 1)
        else:
            self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
            self.transform = nn.Conv2d(out_ch, out_ch, 4, 2, 1)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
        self.bnorm1 = nn.BatchNorm2d(out_ch)
        self.bnorm2 = nn.BatchNorm2d(out_ch)
        self.relu = nn.SiLU()
    def forward(self, x, t):
        h = self.bnorm1(self.relu(self.conv1(x)))
        time_emb = self.relu(self.time_mlp(t))[(..., ) + (None, ) * 2]
        h = h + time_emb
        h = self.bnorm2(self.relu(self.conv2(h)))
        return self.transform(h)

class ResUNet16(nn.Module):
    def __init__(self):
        super().__init__()
        self.channels = [64, 128, 256]
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.ReLU())
        self.conv0 = nn.Conv2d(1, self.channels[0], 3, padding=1)
        self.downs = nn.ModuleList([ResBlock16(self.channels[i], self.channels[i+1], 32) for i in range(len(self.channels)-1)])
        self.ups = nn.ModuleList([ResBlock16(self.channels[i+1], self.channels[i], 32, up=True) for i in reversed(range(len(self.channels)-1))])
        self.output = nn.Conv2d(self.channels[0], 1, 1)
    def forward(self, x, t):
        t_emb = self.time_mlp(t)
        x = self.conv0(x)
        residuals = []
        for down in self.downs:
            x = down(x, t_emb)
            residuals.append(x)
        for up in self.ups:
            x = torch.cat((x, residuals.pop()), dim=1)
            x = up(x, t_emb)
        return self.output(x)

# --- 1-BIT ---
class BitConv2d(nn.Conv2d):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=False):
        super().__init__(in_channels, out_channels, kernel_size, stride, padding, bias=bias)
    def forward(self, x):
        w = self.weight
        w_centered = w - w.mean(dim=(1,2,3), keepdim=True)
        scale = w_centered.abs().mean(dim=(1,2,3), keepdim=True)
        w_bin = torch.sign(w_centered) * scale
        w_final = (w_bin - w).detach() + w 
        return F.conv2d(x, w_final, self.bias, self.stride, self.padding)

class ResBlock1Bit(nn.Module):
    def __init__(self, in_ch, out_ch, time_emb_dim, up=False):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        if up:
            self.conv1 = nn.Conv2d(2*in_ch, out_ch, 3, padding=1) 
            self.transform = nn.ConvTranspose2d(out_ch, out_ch, 4, 2, 1)
        else:
            self.conv1 = BitConv2d(in_ch, out_ch, 3, padding=1)
            self.transform = nn.Conv2d(out_ch, out_ch, 4, 2, 1)
        self.conv2 = BitConv2d(out_ch, out_ch, 3, padding=1)
        self.bnorm1 = nn.BatchNorm2d(out_ch)
        self.bnorm2 = nn.BatchNorm2d(out_ch)
        self.relu = nn.SiLU()
    def forward(self, x, t):
        h = self.bnorm1(self.relu(self.conv1(x)))
        time_emb = self.relu(self.time_mlp(t))[(..., ) + (None, ) * 2]
        h = h + time_emb
        h = self.bnorm2(self.relu(self.conv2(h)))
        return self.transform(h)

class ResUNet1Bit(nn.Module):
    def __init__(self):
        super().__init__()
        self.channels = [64, 128, 256]
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.ReLU())
        self.conv0 = nn.Conv2d(1, self.channels[0], 3, padding=1)
        self.downs = nn.ModuleList([ResBlock1Bit(self.channels[i], self.channels[i+1], 32) for i in range(len(self.channels)-1)])
        self.ups = nn.ModuleList([ResBlock1Bit(self.channels[i+1], self.channels[i], 32, up=True) for i in reversed(range(len(self.channels)-1))])
        self.output = nn.Conv2d(self.channels[0], 1, 1)
    def forward(self, x, t):
        t_emb = self.time_mlp(t)
        x = self.conv0(x)
        residuals = []
        for down in self.downs:
            x = down(x, t_emb)
            residuals.append(x)
        for up in self.ups:
            x = torch.cat((x, residuals.pop()), dim=1)
            x = up(x, t_emb)
        return self.output(x)

# =======================
# LOAD MODEL
# =======================
if MODEL_QUANT == 16:
    model = ResUNet16().to(DEVICE)
    model.load_state_dict(torch.load(str(HERE / "gen_16bit.pth"), map_location=DEVICE))
elif MODEL_QUANT == 1:
    model = ResUNet1Bit().to(DEVICE)
    model.load_state_dict(torch.load(str(HERE / "gen_1bit.pth"), map_location=DEVICE))
else:
    raise ValueError("MODEL_QUANT must be 1 or 16")

model.eval()

# =======================
# DIFFUSION SAMPLING
# =======================
@torch.no_grad()
def sample(model, n):
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    x = torch.randn(n, 1, 28, 28).to(DEVICE)

    for i in reversed(range(1000)):
        t = torch.full((n,), i, device=DEVICE, dtype=torch.long)
        pred_noise = model(x, t)

        alpha = alphas[i]
        alpha_bar = alphas_cumprod[i]
        beta = betas[i]

        if i > 0:
            noise = torch.randn_like(x)
        else:
            noise = 0

        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / torch.sqrt(1 - alpha_bar)) * pred_noise) + torch.sqrt(beta) * noise

    x = (x.clamp(-1, 1) + 1) / 2
    return x

# =======================
# GENERATE & SAVE
# =======================
samples = sample(model, N_SAMPLES)
save_image(samples, SAVE_PATH, nrow=4)

print(f"Saved to {SAVE_PATH}")
