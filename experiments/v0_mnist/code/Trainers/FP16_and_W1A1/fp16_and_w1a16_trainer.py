# @title Final Experiment: 1-Bit vs 16-Bit (Full MNIST 0-9)
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
from models.architectures import ResUNet_FP16, ResUNet_W1A16

# --- CONFIG ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 16
EPOCHS = 1          # Increased for full dataset
LR = 1e-3


# ==========================================
# 3. TRAINING ENGINE (FULL MNIST)
# ==========================================
def train_model(model_class, name):
    print(f"\n--- Starting Training: {name} (Full MNIST) ---")
    model = model_class().to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    mse = nn.MSELoss()
    scaler = GradScaler('cuda')
    
    transform = transforms.Compose([transforms.ToTensor(), transforms.Lambda(lambda t: (t * 2) - 1)])
    # Load ALL digits (No filtering)
    dataset = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
    print(f"Dataset Size: {len(dataset)} images (All Digits)")
    
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
    
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    model.train()
    for epoch in range(EPOCHS):
        pbar = tqdm(dataloader, desc=f"Epoch {epoch+1}/{EPOCHS}", leave=False)
        for x, _ in pbar:
            x = x.to(DEVICE)
            t = torch.randint(0, 1000, (BATCH_SIZE,), device=DEVICE).long()
            noise = torch.randn_like(x)
            
            sqrt_alphas_cumprod_t = torch.sqrt(alphas_cumprod[t])[:, None, None, None]
            sqrt_one_minus_alphas_cumprod_t = torch.sqrt(1 - alphas_cumprod[t])[:, None, None, None]
            noisy_x = sqrt_alphas_cumprod_t * x + sqrt_one_minus_alphas_cumprod_t * noise
            
            optimizer.zero_grad()
            with autocast('cuda'):
                noise_pred = model(noisy_x, t)
                loss = mse(noise_pred, noise)
            
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            pbar.set_postfix(loss=loss.item())
            
    return model, dataset

# ==========================================
# 4. EVALUATION ENGINE
# ==========================================
@torch.no_grad()
def generate_samples(model, n_samples=100):
    model.eval()
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    x = torch.randn(n_samples, 1, 28, 28).to(DEVICE)
    
    for i in tqdm(reversed(range(1000)), desc="Generating", total=1000, leave=False):
        t = torch.full((n_samples,), i, device=DEVICE, dtype=torch.long)
        predicted_noise = model(x, t)
        
        alpha = alphas[i]
        alpha_cumprod = alphas_cumprod[i]
        beta = betas[i]
        
        if i > 0:
            noise = torch.randn_like(x)
        else:
            noise = 0
        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / (torch.sqrt(1 - alpha_cumprod))) * predicted_noise) + torch.sqrt(beta) * noise
        
    return (x.clamp(-1, 1) + 1) / 2

def rigorous_eval(model_name, generated_imgs, training_imgs):
    # This bench is just for evaluating if the DMs are properly trained

    gen_flat = generated_imgs.view(generated_imgs.shape[0], -1).cpu().numpy()
    train_flat = training_imgs.view(training_imgs.shape[0], -1).float().cpu().numpy() / 255.0
    
    print(f"\nAnalyzing {model_name}...")
    
    # Sample training data for speed
    indices = np.random.choice(train_flat.shape[0], 5000, replace=False)
    subset_train = train_flat[indices]
    
    # 1. MEMORIZATION
    dists = cdist(gen_flat, subset_train, metric='euclidean')
    min_dists = dists.min(axis=1) 
    avg_min_dist = min_dists.mean()
    
    # 2. DIVERSITY
    intra_dists = cdist(gen_flat, gen_flat, metric='euclidean')
    np.fill_diagonal(intra_dists, np.nan)
    avg_diversity = np.nanmean(intra_dists)

    print(f"  > Avg Dist to Nearest Training Data: {avg_min_dist:.4f}")
    print(f"  > Avg Dist between Generated Data:   {avg_diversity:.4f}")
    return avg_min_dist, avg_diversity

# ==========================================
# 5. RUN EXPERIMENT
# ==========================================

# A. Train 16-Bit
model_16, dataset = train_model(ResUNet_FP16, "16-Bit Control")
imgs_16 = generate_samples(model_16, 100)

# B. Train 1-Bit
model_1, _ = train_model(ResUNet_W1A16, "1-Bit Experimental")
imgs_1 = generate_samples(model_1, 100)


torch.save(model_16.state_dict(), r".\Trained_models\fp16_diffusion_checkpoints\fp16_new.pth")
torch.save(model_1.state_dict(), r".\Trained_models\w1a16_diffusion_checkpoints\w1a16_new.pth")

# C. Visualize
fig, ax = plt.subplots(2, 8, figsize=(16, 4))
fig.suptitle("Top: 16-Bit | Bottom: 1-Bit (Full MNIST)")
for i in range(8):
    ax[0,i].imshow(imgs_16[i, 0].cpu(), cmap='gray')
    ax[0,i].axis('off')
    ax[1,i].imshow(imgs_1[i, 0].cpu(), cmap='gray')
    ax[1,i].axis('off')
plt.show()

# D. Quantify
print("\n=== QUANTITATIVE REPORT ===")
train_data_tensor = dataset.data
score_mem_16, score_div_16 = rigorous_eval("16-Bit Model", imgs_16, train_data_tensor)
score_mem_1, score_div_1 = rigorous_eval("1-Bit Model", imgs_1, train_data_tensor)