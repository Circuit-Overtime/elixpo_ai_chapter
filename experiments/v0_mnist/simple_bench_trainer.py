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
from pathlib import Path

# --- CONFIG ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ROOT = Path(__file__).resolve().parents[2]
CKPT = ROOT / "checkpoints"; CKPT.mkdir(exist_ok=True)
BATCH_SIZE = 128
EPOCHS = 20          # Increased for full dataset
LR = 1e-3

# ==========================================
# 1. SHARED ARCHITECTURE COMPONENTS
# ==========================================
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

# ==========================================
# 2. THE TWO CONTENDERS
# ==========================================

# --- MODEL A: 16-BIT RES-UNET (CONTROL) ---
class ResBlock16(nn.Module):
    def __init__(self, in_ch, out_ch, time_emb_dim, up=False):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        if up:
            self.conv1 = nn.Conv2d(2 * in_ch, out_ch, 3, padding=1)
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
            residual = residuals.pop()
            x = torch.cat((x, residual), dim=1)
            x = up(x, t_emb)
        return self.output(x)

# --- MODEL B: 1-BIT RES-UNET (EXPERIMENTAL) ---
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
            self.conv1 = nn.Conv2d(2 * in_ch, out_ch, 3, padding=1) 
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
model_16, dataset = train_model(ResUNet16, "16-Bit Control")
imgs_16 = generate_samples(model_16, 100)

# B. Train 1-Bit
model_1, _ = train_model(ResUNet1Bit, "1-Bit Experimental")
imgs_1 = generate_samples(model_1, 100)


torch.save(model_16.state_dict(), str(CKPT / "gen_16AAAbit.pth"))
torch.save(model_1.state_dict(), str(CKPT / "gen_1AAAbit.pth"))

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