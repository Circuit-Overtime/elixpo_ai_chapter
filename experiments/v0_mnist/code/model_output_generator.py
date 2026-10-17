import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm
import os
from models.architectures import ResUNet_FP16, ResUNet_W1A16, ResUNet_W1A1

"""
Generates samples for 3 models for a 3-way comparison
"""

# --- CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 16  # We need exactly 16 images for a 4x4 grid
OUTPUT_FILE = "three_model_comparison.png"

# --- PATHS ---
PATH_BNN      = r".\pre_trained_models\BNN_W1A1\fp16_to_w1a1.pth" # choose "fp16_to_w1a1.pth" OR "w1a1.pth"
PATH_1BIT     = r".\pre_trained_models\FP16_and_W1A16\fp16_to_w1a16.pth" # choose "fp16_to_w1a16.pth" OR "w1a16.pth"
PATH_16BIT    = r".\pre_trained_models\FP16_and_W1A16\fp16.pth"


# ==========================================
# 4. UTILS
# ==========================================
def load_model(model, path):
    if not os.path.exists(path):
        print(f"❌ File not found: {path}")
        return None
    try:
        model.load_state_dict(torch.load(path, map_location=DEVICE))
        model.to(DEVICE)
        model.eval()
        print(f"✅ Loaded {model.__class__.__name__}")
        return model
    except Exception as e:
        print(f"❌ Failed to load {path}: {e}")
        return None

@torch.no_grad()
def generate(model, n=16):
    model.eval()
    x = torch.randn(n, 1, 28, 28).to(DEVICE)
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    for i in tqdm(reversed(range(1000)), desc="Sampling", leave=False):
        t = torch.full((n,), i, device=DEVICE, dtype=torch.long)
        pred_noise = model(x, t)
        alpha = alphas[i]
        alpha_cumprod = alphas_cumprod[i]
        beta = betas[i]
        if i > 0: noise = torch.randn_like(x)
        else: noise = 0
        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * pred_noise) + torch.sqrt(beta) * noise
    return x.clamp(-1, 1).cpu()

# ==========================================
# 5. MAIN
# ==========================================
if __name__ == "__main__":
    print("--- 3-WAY MODEL COMPARISON ---")
    
    # 1. Load All Models
    model_bnn = load_model(ResUNet_W1A1(), PATH_BNN)
    model_1bit = load_model(ResUNet_W1A16(), PATH_1BIT)
    model_16bit = load_model(ResUNet_FP16(), PATH_16BIT)

    if model_bnn and model_1bit and model_16bit:
        print("\nGenerating samples...")
        
        # 2. Generate
        samples_16bit = generate(model_16bit, 16)
        samples_1bit = generate(model_1bit, 16)
        samples_bnn = generate(model_bnn, 16)
        
        # 3. Plot
        fig, axes = plt.subplots(3, 4, figsize=(8, 6)) # Wait, 3 models, but we want 4x4 grids.
        # Let's do 3 separate subplots
        
        plt.close(fig)
        fig = plt.figure(figsize=(15, 6))
        #fig.set_facecolor('lightblue');
        
        # Grid 1: 16-Bit
        ax1 = fig.add_subplot(1, 3, 1)
        grid1 = torch.cat([torch.cat([s for s in samples_16bit[i*4:(i+1)*4]], dim=2) for i in range(4)], dim=1)
        ax1.imshow(grid1.permute(1, 2, 0).numpy(), cmap='gray')
        ax1.set_title("16-Bit Baseline (FP16)", fontsize=14)
        ax1.axis('off')

        # Grid 2: 1-Bit (ResUNet1Bit)
        ax2 = fig.add_subplot(1, 3, 2)
        grid2 = torch.cat([torch.cat([s for s in samples_1bit[i*4:(i+1)*4]], dim=2) for i in range(4)], dim=1)
        ax2.imshow(grid2.permute(1, 2, 0).numpy(), cmap='gray')
        ax2.set_title("W1A16 (Centered Weights)", fontsize=14)
        ax2.axis('off')

        # Grid 3: True BNN
        ax3 = fig.add_subplot(1, 3, 3)
        grid3 = torch.cat([torch.cat([s for s in samples_bnn[i*4:(i+1)*4]], dim=2) for i in range(4)], dim=1)
        ax3.imshow(grid3.permute(1, 2, 0).numpy(), cmap='gray')
        ax3.set_title("W1A1 (Full Binary, no Centering)", fontsize=14)
        ax3.axis('off')

        plt.tight_layout()
        plt.savefig(OUTPUT_FILE, dpi=300)
        print(f"\n✅ Comparison Saved to {OUTPUT_FILE}")
        plt.show()
    else:
        print("❌ Could not load all models. Check paths.")