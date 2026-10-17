import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm
import os
from models.architectures import ResUNet_FP16, ResUNet_W1A16, MNISTClassifier

# --- 1. CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 100
N_SAMPLES = 1000
OUTPUT_IMAGE_PATH = "correct_comparison.png"


PATH_JUDGE   = r".\models\judge_mnist.pth"
PATH_GEN_1   = r".\pre_trained_models\FP16_and_W1A16\w1a16.pth"
PATH_GEN_16  = r".\pre_trained_models\FP16_and_W1A16\fp16.pth"



# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================

def load_model_safe(model_class, path):
    if not os.path.exists(path):
        print(f"❌ ERROR: File not found at {path}")
        return None
    print(f"Loading {model_class.__name__} from {path}...")
    try:
        model = model_class().to(DEVICE)
        state_dict = torch.load(path, map_location=DEVICE)
        model.load_state_dict(state_dict)
        model.eval()
        return model
    except Exception as e:
        print(f"❌ LOAD FAILED: {e}")
        return None

@torch.no_grad()
def generate_images(model, n_imgs=16):
    model.eval()
    # DDPM Constants
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    x = torch.randn(n_imgs, 1, 28, 28).to(DEVICE)
    
    # Exact sampling loop from your training script
    for i in tqdm(reversed(range(1000)), desc="Sampling", leave=False):
        t = torch.full((n_imgs,), i, device=DEVICE, dtype=torch.long)
        predicted_noise = model(x, t)
        
        alpha = alphas[i]
        alpha_cumprod = alphas_cumprod[i]
        beta = betas[i]
        
        if i > 0: noise = torch.randn_like(x)
        else: noise = 0
        
        # DDPM Equation
        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * predicted_noise) + torch.sqrt(beta) * noise
        
    return x.clamp(-1, 1)

def save_comparison_grid(imgs_16, imgs_1, filename):
    imgs_16 = imgs_16.cpu().numpy()
    imgs_1 = imgs_1.cpu().numpy()
    
    fig, axes = plt.subplots(2, 8, figsize=(16, 5))
    plt.subplots_adjust(wspace=0.1, hspace=0.1)
    
    for i in range(8):
        ax = axes[0, i]
        ax.imshow(imgs_16[i, 0], cmap='gray')
        ax.axis('off')
        if i == 0: ax.set_title("16-Bit Control", fontsize=14, loc='left')

    for i in range(8):
        ax = axes[1, i]
        ax.imshow(imgs_1[i, 0], cmap='gray')
        ax.axis('off')
        if i == 0: ax.set_title("1-Bit Experimental", fontsize=14, loc='left')

    plt.suptitle("Structural Stability Comparison", fontsize=20, y=0.95)
    plt.savefig(filename, bbox_inches='tight', dpi=300)
    print(f"✅ Saved comparison grid to {filename}")
    plt.close()

# ==========================================
# 4. MAIN EXECUTION
# ==========================================

if __name__ == "__main__":
    print(f"\n--- 1-BIT vs 16-BIT FINAL EVALUATION ---")
    
    # 1. Load Models
    judge = load_model_safe(MNISTClassifier, PATH_JUDGE)
    gen_16 = load_model_safe(ResUNet_FP16, PATH_GEN_16)
    gen_1 = load_model_safe(ResUNet_W1A16, PATH_GEN_1)

    if gen_16 and gen_1 and judge:
        # --- A. LEGIBILITY TEST ---
        print("\n[Running Legibility Test]")
        
        # Test 16-Bit
        print("Testing 16-Bit...")
        score_16 = 0
        samples_16 = []
        for _ in tqdm(range(N_SAMPLES // BATCH_SIZE)):
            imgs = generate_images(gen_16, BATCH_SIZE)
            logits = judge(imgs)
            probs = F.softmax(logits, dim=1)
            conf, _ = torch.max(probs, dim=1)
            score_16 += conf.mean().item()
            if len(samples_16) == 0: samples_16 = imgs[:8] 
        score_16 /= (N_SAMPLES // BATCH_SIZE)

        # Test 1-Bit
        print("Testing 1-Bit...")
        score_1 = 0
        samples_1 = []
        for _ in tqdm(range(N_SAMPLES // BATCH_SIZE)):
            imgs = generate_images(gen_1, BATCH_SIZE)
            logits = judge(imgs)
            probs = F.softmax(logits, dim=1)
            conf, _ = torch.max(probs, dim=1)
            score_1 += conf.mean().item()
            if len(samples_1) == 0: samples_1 = imgs[:8] 
        score_1 /= (N_SAMPLES // BATCH_SIZE)

        print("\n" + "="*45)
        print("        FINAL RESULTS: UTILITY TEST        ")
        print("="*45)
        print(f"16-Bit Confidence: {score_16:.4f} ({(score_16*100):.2f}%)")
        print(f"1-Bit Confidence:  {score_1:.4f} ({(score_1*100):.2f}%)")
        
        # --- B. SAVE IMAGE GRID ---
        print("\n[Generating Comparison Grid]")
        save_comparison_grid(samples_16, samples_1, OUTPUT_IMAGE_PATH)

    else:
        print("❌ Could not load all models. Check paths.")