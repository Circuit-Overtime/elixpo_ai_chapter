import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
from tqdm import tqdm
import os
from pathlib import Path

# --- 1. CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 100 # Batch size for generation
N_SAMPLES = 1000 # Total images to test per model (Higher = More accurate)

# --- PATHS (repo-relative; resolved from this file's location) ---
ROOT = Path(__file__).resolve().parents[2]
CKPT = ROOT / "checkpoints"
PATH_JUDGE  = str(CKPT / "judge_mnist.pth")
PATH_GEN_1  = str(CKPT / "gen_1bit.pth")
PATH_GEN_16 = str(CKPT / "gen_16bit.pth")

# ==========================================
# 2. ARCHITECTURE DEFINITIONS (REQUIRED TO LOAD WEIGHTS)
# ==========================================

# --- HELPERS ---
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

# --- THE JUDGE ---
class MNISTClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, 1)
        self.conv2 = nn.Conv2d(32, 64, 3, 1)
        self.dropout1 = nn.Dropout(0.25)
        self.dropout2 = nn.Dropout(0.5)
        self.fc1 = nn.Linear(9216, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x, return_features=False):
        x = self.conv1(x)
        x = F.relu(x)
        x = self.conv2(x)
        x = F.relu(x)
        x = F.max_pool2d(x, 2)
        x = self.dropout1(x)
        x = torch.flatten(x, 1)
        features = self.fc1(x)
        x = F.relu(features)
        x = self.dropout2(x)
        x = self.fc2(x)
        if return_features: return x, features
        return x

# --- 16-BIT ARCHITECTURE ---
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

# --- 1-BIT ARCHITECTURE ---
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

# ==========================================
# 3. EVALUATION LOGIC
# ==========================================

def load_model_safe(model_class, path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Path not found: {path}")
    print(f"Loading {model_class.__name__} from {path}...")
    model = model_class().to(DEVICE)
    # Use map_location to ensure it loads to correct device (cpu/cuda)
    state_dict = torch.load(path, map_location=DEVICE)
    model.load_state_dict(state_dict)
    model.eval()
    return model

@torch.no_grad()
def check_legibility(model_gen, model_judge, n_samples):
    model_gen.eval()
    model_judge.eval()
    
    avg_confidence = []
    
    # Diffusion Constants
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    n_batches = n_samples // BATCH_SIZE
    print(f"Running Utility Test ({n_samples} images)...")

    for _ in tqdm(range(n_batches)):
        # 1. GENERATE
        x = torch.randn(BATCH_SIZE, 1, 28, 28).to(DEVICE)
        
        # Fast Diffusion Loop (Unconditional)
        for i in reversed(range(1000)):
            t = torch.full((BATCH_SIZE,), i, device=DEVICE, dtype=torch.long)
            predicted_noise = model_gen(x, t)
            
            alpha = alphas[i]
            alpha_cumprod = alphas_cumprod[i]
            beta = betas[i]
            
            if i > 0: noise = torch.randn_like(x)
            else: noise = 0
            x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * predicted_noise) + torch.sqrt(beta) * noise
        
        # 2. PREPARE FOR JUDGE
        # Diffusion output is approx -1 to 1.
        # Clamp just to be safe.
        x_clamped = x.clamp(-1, 1)
        
        # 3. JUDGE
        logits = model_judge(x_clamped)
        probs = F.softmax(logits, dim=1)
        
        # Get Max Probability (Confidence) for each image
        confidence, _ = torch.max(probs, dim=1)
        avg_confidence.extend(confidence.cpu().numpy())
    
    mean_conf = np.mean(avg_confidence)
    return mean_conf

# ==========================================
# 4. MAIN EXECUTION
# ==========================================

if __name__ == "__main__":
    print(f"--- 1-BIT vs 16-BIT LEGIBILITY TEST ---")
    print(f"Device: {DEVICE}")
    
    # 1. Load Judge
    try:
        judge = load_model_safe(MNISTClassifier, PATH_JUDGE)
    except Exception as e:
        print(f"Error loading Judge: {e}")
        exit()

    # 2. Evaluate 16-Bit
    try:
        gen_16 = load_model_safe(ResUNet16, PATH_GEN_16)
        score_16 = check_legibility(gen_16, judge, N_SAMPLES)
    except Exception as e:
        print(f"Error evaluating 16-bit model: {e}")
        score_16 = 0.0

    # 3. Evaluate 1-Bit
    try:
        gen_1 = load_model_safe(ResUNet1Bit, PATH_GEN_1)
        score_1 = check_legibility(gen_1, judge, N_SAMPLES)
    except Exception as e:
        print(f"Error evaluating 1-bit model: {e}")
        score_1 = 0.0

    # 4. Final Report
    print("\n" + "="*40)
    print("      FINAL LEGIBILITY (UTILITY) SCORES      ")
    print("="*40)
    print(f"Metric: Mean Confidence Score (0.0 - 1.0)")
    print(f"Interpretation: >0.90 is 'Clear', <0.50 is 'Unreadable'")
    print("-" * 40)
    print(f"16-Bit Model: {score_16:.4f} ({(score_16*100):.2f}%)")
    print(f"1-Bit Model:  {score_1:.4f} ({(score_1*100):.2f}%)")
    print("-" * 40)
    
    gap = score_16 - score_1
    if abs(gap) < 0.05:
        print(f"CONCLUSION: The 1-bit model is functionally IDENTICAL in legibility.")
    elif score_1 > 0.90:
        print(f"CONCLUSION: The 1-bit model is HIGHLY LEGIBLE, despite the FMD score.")
    else:
        print(f"CONCLUSION: The 1-bit model struggles with clarity.")