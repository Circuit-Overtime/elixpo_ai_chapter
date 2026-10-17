import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from tqdm import tqdm
from scipy import linalg
from torchvision.models import inception_v3
from torchvision import transforms
import math
from models.architectures import ResUNet_FP16, ResUNet_W1A16


# --- CONFIGURATION ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 50
N_SAMPLES = 2000  # Standard is 2k-10k. 2000 is good for a quick rigorous check.

# --- PATHS (Update as needed) ---
PATH_GEN_1   = r".\pre_trained_models\FP16_and_W1A16\w1a16.pth"
PATH_GEN_16  = r".\pre_trained_models\FP16_and_W1A16\fp16.pth"



# ==========================================
# 2. FID CALCULATION LOGIC (I'm sorry for poor documentation)
# ==========================================

class InceptionV3FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        self.inception = inception_v3(pretrained=True, transform_input=False)
        self.inception.fc = nn.Identity() # Remove classification layer
        self.inception.eval()
        
    def forward(self, x):
        # Bruh...resize to 299x299 (cuz its required by inception)
        # MNIST is 1 channel, Inception needs 3. Hence, repeat the channel.
        x = x.repeat(1, 3, 1, 1)
        x = F.interpolate(x, size=(299, 299), mode='bilinear', align_corners=False)
        # x = F.interpolate(x, size=(299, 299), mode='closest', align_corners=False) # lmfao ded
        # Normalize to [-1, 1] range which Inception expects? 
        # ChadGPT says Inception expects roughly mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        # But for FID on MNIST, standard range -1 to 1 is often accepted if consistent.
        # Because we are just comparing, [-1, 1] is just fine
        # Lol nvm pytorch already has fid preprocessing
        return self.inception(x)

def get_statistics(model_gen, inception, n_samples):
    model_gen.eval()
    inception.eval()
    
    features = []
    
    # Diffusion Constants
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    n_batches = n_samples // BATCH_SIZE
    print(f"   Generating {n_samples} samples...")

    with torch.no_grad():
        for _ in tqdm(range(n_batches)):
            # 1. Generate Batch
            x = torch.randn(BATCH_SIZE, 1, 28, 28).to(DEVICE)
            for i in reversed(range(1000)):
                t = torch.full((BATCH_SIZE,), i, device=DEVICE, dtype=torch.long)
                pred_noise = model_gen(x, t)
                alpha = alphas[i]
                alpha_cumprod = alphas_cumprod[i]
                beta = betas[i]
                if i > 0: noise = torch.randn_like(x)
                else: noise = 0
                x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * pred_noise) + torch.sqrt(beta) * noise
            
            x = x.clamp(-1, 1) # Range [-1, 1]
            
            # 2. Extract Features
            feat = inception(x)
            features.append(feat.cpu().numpy())

    features = np.concatenate(features, axis=0)
    mu = np.mean(features, axis=0)
    sigma = np.cov(features, rowvar=False)
    return mu, sigma

def calculate_frechet_distance(mu1, sigma1, mu2, sigma2):
    """Numpy implementation of the Frechet Distance."""
    ssdiff = np.sum((mu1 - mu2)**2.0)
    covmean = linalg.sqrtm(sigma1.dot(sigma2))
    
    # Check and correct imaginary numbers from sqrtm
    if np.iscomplexobj(covmean):
        covmean = covmean.real
        
    tr_covmean = np.trace(covmean)
    return ssdiff + np.trace(sigma1) + np.trace(sigma2) - 2 * tr_covmean

# ==========================================
# 3. REAL DATA STATISTICS (BASELINE)
# ==========================================
def get_real_mnist_stats(inception, n_samples):
    print("   Extracting features from Real MNIST...")
    from torchvision.datasets import MNIST
    
    dataset = MNIST(root='./data', train=False, download=True, 
                   transform=transforms.Compose([
                       transforms.ToTensor(),
                       transforms.Normalize((0.5,), (0.5,)) # Scale to [-1, 1]
                   ]))
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    features = []
    inception.eval()
    
    count = 0
    with torch.no_grad():
        for x, _ in loader:
            if count >= n_samples: break
            x = x.to(DEVICE)
            feat = inception(x)
            features.append(feat.cpu().numpy())
            count += BATCH_SIZE
            
    features = np.concatenate(features, axis=0)[:n_samples]
    mu = np.mean(features, axis=0)
    sigma = np.cov(features, rowvar=False)
    return mu, sigma

# ==========================================
# 4. MAIN
# ==========================================
if __name__ == "__main__":
    print(f"--- W1A1 vs FP16 FID TEST ---")
    
    # 1. Load Inception
    print("Loading InceptionV3...")
    inception = InceptionV3FeatureExtractor().to(DEVICE)
    
    # 2. Get Real Data Stats (The "Ground Truth")
    mu_real, sigma_real = get_real_mnist_stats(inception, N_SAMPLES)
    
    # 3. Load & Test 16-Bit
    gen_16 = ResUNet_FP16().to(DEVICE) 
    try:
        gen_16.load_state_dict(torch.load(PATH_GEN_16, map_location=DEVICE))
        print("\n[Testing 16-Bit Model]")
        mu_16, sigma_16 = get_statistics(gen_16, inception, N_SAMPLES)
        fid_16 = calculate_frechet_distance(mu_real, sigma_real, mu_16, sigma_16)
        print(f"✅ 16-Bit FID: {fid_16:.4f}")
    except Exception as e:
        print(f"Failed to load 16-bit: {e}")

    # 4. Load & Test 1-Bit
    gen_1 = ResUNet_W1A16().to(DEVICE) 
    try:
        gen_1.load_state_dict(torch.load(PATH_GEN_1, map_location=DEVICE))
        print("\n[Testing 1-Bit Model]")
        mu_1, sigma_1 = get_statistics(gen_1, inception, N_SAMPLES)
        fid_1 = calculate_frechet_distance(mu_real, sigma_real, mu_1, sigma_1)
        print(f"✅ 1-Bit FID:  {fid_1:.4f}")
    except Exception as e:
        print(f"Failed to load 1-bit: {e}")