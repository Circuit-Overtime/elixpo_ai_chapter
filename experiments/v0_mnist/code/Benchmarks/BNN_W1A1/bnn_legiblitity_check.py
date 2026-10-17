import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm
import os
from models.architectures import ResUNet_W1A1, MNISTClassifier

# --- CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 100
N_SAMPLES = 1000  # Number of images to generate & judge

OUTPUT_IMAGE = r".\bnn_legibility_samples.png"


MODEL_PATH = r".\pre_trained_models\BNN_W1A1\w1a1.pth"
JUDGE_PATH = r".\models\judge_mnist.pth"




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
    # Standard DDPM Schedule (Linear)
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    x = torch.randn(n_imgs, 1, 28, 28).to(DEVICE)
    
    for i in tqdm(reversed(range(1000)), desc="Sampling", leave=False):
        t = torch.full((n_imgs,), i, device=DEVICE, dtype=torch.long)
        predicted_noise = model(x, t)
        
        alpha = alphas[i]
        alpha_cumprod = alphas_cumprod[i]
        beta = betas[i]
        
        if i > 0: noise = torch.randn_like(x)
        else: noise = 0
        
        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * predicted_noise) + torch.sqrt(beta) * noise
        
    return x.clamp(-1, 1)

def save_image_grid(imgs, filename):
    imgs = imgs.cpu().numpy()
    fig, axes = plt.subplots(4, 8, figsize=(16, 8)) # 32 images
    plt.subplots_adjust(wspace=0.1, hspace=0.1)
    
    for i, ax in enumerate(axes.flatten()):
        if i < len(imgs):
            ax.imshow(imgs[i, 0], cmap='gray')
            ax.axis('off')
    
    plt.suptitle("ResUNetBNN Generated Samples", fontsize=16)
    plt.savefig(filename, bbox_inches='tight', dpi=150)
    print(f"✅ Saved sample grid to {filename}")
    plt.close()

# ==========================================
# 4. MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    print(f"--- 1-BIT BNN LEGIBILITY CHECK ---")
    print(f"Device: {DEVICE}")
    
    # 1. Load Models
    bnn_model = load_model_safe(ResUNet_W1A1, MODEL_PATH)
    judge_model = load_model_safe(MNISTClassifier, JUDGE_PATH)
    
    if bnn_model and judge_model:
        print(f"\n[Running Legibility Test on {N_SAMPLES} samples]")
        
        total_score = 0
        n_batches = N_SAMPLES // BATCH_SIZE
        all_samples = []

        for _ in tqdm(range(n_batches), desc="Evaluating"):
            # A. Generate
            imgs = generate_images(bnn_model, BATCH_SIZE)
            if len(all_samples) == 0: all_samples = imgs[:32] # Save first batch for grid
            
            # B. Judge
            logits = judge_model(imgs)
            probs = F.softmax(logits, dim=1)
            conf, _ = torch.max(probs, dim=1)
            total_score += conf.mean().item()
            
        final_score = total_score / n_batches
        
        print("\n" + "="*45)
        print(f"✅ BNN LEGIBILITY SCORE: {final_score:.4f} ({(final_score*100):.2f}%)")
        print("="*45)
        
        save_image_grid(all_samples, OUTPUT_IMAGE)
    else:
        print("❌ Evaluation Aborted due to loading errors.")