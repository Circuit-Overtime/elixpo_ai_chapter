import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from tqdm import tqdm
from scipy import linalg
from torchvision.models import inception_v3
from torchvision import datasets, transforms
import math
import os
from models.architectures import ResUNet_W1A1

# --- CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 50       # Batch size for generation/feature extraction
N_SAMPLES = 2000      # Number of samples to compare (Standard is 2k-10k)
MODEL_PATH = r".\pre_trained_models\BNN_W1A1\w1a1.pth" 





# ==========================================
# 2. FID HELPERS
# ==========================================

class InceptionV3FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        self.inception = inception_v3(weights='DEFAULT', transform_input=False)
        self.inception.fc = nn.Identity() # Remove classification layer
        self.inception.eval()
        
    def forward(self, x):
        # 1. Resize 28x28 -> 299x299 (Bilinear interpolation)
        x = F.interpolate(x, size=(299, 299), mode='bilinear', align_corners=False)
        # 2. Expand 1 channel -> 3 channels
        if x.shape[1] == 1:
            x = x.repeat(1, 3, 1, 1)
        # 3. Inception expects inputs normalized roughly to [-1, 1] or [0, 1]
        # Our diffusion output is [-1, 1], so this is compatible.
        return self.inception(x)

def calculate_frechet_distance(mu1, sigma1, mu2, sigma2):
    """Numpy implementation of the Frechet Distance."""
    ssdiff = np.sum((mu1 - mu2)**2.0)
    covmean = linalg.sqrtm(sigma1.dot(sigma2))
    
    # Check and correct imaginary numbers from sqrtm
    if np.iscomplexobj(covmean):
        covmean = covmean.real
        
    tr_covmean = np.trace(covmean)
    return ssdiff + np.trace(sigma1) + np.trace(sigma2) - 2 * tr_covmean

def get_real_stats(inception, n_samples):
    print(">>> Computing stats for REAL MNIST...")
    # Load MNIST
    dataset = datasets.MNIST(root='./data', train=False, download=True, 
                           transform=transforms.Compose([
                               transforms.ToTensor(),
                               transforms.Lambda(lambda t: (t * 2) - 1) # Scale to [-1, 1]
                           ]))
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    features = []
    count = 0
    with torch.no_grad():
        for x, _ in tqdm(loader, total=n_samples//BATCH_SIZE):
            if count >= n_samples: break
            x = x.to(DEVICE)
            feat = inception(x)
            features.append(feat.cpu().numpy())
            count += BATCH_SIZE
            
    features = np.concatenate(features, axis=0)[:n_samples]
    return np.mean(features, axis=0), np.cov(features, rowvar=False)

def get_fake_stats(model, inception, n_samples):
    print(f">>> Computing stats for 1-BIT MODEL ({n_samples} samples)...")
    features = []
    
    # Standard DDPM Schedule
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    n_batches = n_samples // BATCH_SIZE
    
    with torch.no_grad():
        for _ in tqdm(range(n_batches)):
            # 1. Generate Batch
            x = torch.randn(BATCH_SIZE, 1, 28, 28).to(DEVICE)
            
            # Sampling Loop
            for i in reversed(range(1000)):
                t = torch.full((BATCH_SIZE,), i, device=DEVICE, dtype=torch.long)
                pred_noise = model(x, t)
                
                alpha = alphas[i]
                alpha_cumprod = alphas_cumprod[i]
                beta = betas[i]
                
                if i > 0: noise = torch.randn_like(x)
                else: noise = 0
                
                x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * pred_noise) + torch.sqrt(beta) * noise
            
            x = x.clamp(-1, 1)
            
            # 2. Extract Features
            feat = inception(x)
            features.append(feat.cpu().numpy())
            
    features = np.concatenate(features, axis=0)
    return np.mean(features, axis=0), np.cov(features, rowvar=False)

# ==========================================
# 3. MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    print(f"--- 1-BIT RESUNET FID CALCULATOR ---")
    print(f"Device: {DEVICE}")
    
    # 1. Load Inception
    inception = InceptionV3FeatureExtractor().to(DEVICE)
    
    # 2. Get Real Stats (Baseline)
    mu_real, sigma_real = get_real_stats(inception, N_SAMPLES)
    
    # 3. Load 1-Bit Model
    model = ResUNet_W1A1().to(DEVICE)
    if os.path.exists(MODEL_PATH):
        print(f"Loading weights from {MODEL_PATH}...")
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
        model.eval()
        
        # 4. Get Fake Stats & Compute FID
        mu_fake, sigma_fake = get_fake_stats(model, inception, N_SAMPLES)
        
        fid = calculate_frechet_distance(mu_real, sigma_real, mu_fake, sigma_fake)
        print("\n" + "="*40)
        print(f"✅ FINAL FID SCORE: {fid:.4f}")
        print("="*40)
    else:
        print(f"❌ ERROR: Model file not found at {MODEL_PATH}")
        print("Please update the MODEL_PATH variable at the top of the script.")