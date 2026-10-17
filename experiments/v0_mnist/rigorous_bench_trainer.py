# @title The Rigorous Benchmark: FMD, Class Entropy, and Memorization
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

# --- CONFIG ---
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ROOT = Path(__file__).resolve().parents[2]
CKPT = ROOT / "checkpoints"; CKPT.mkdir(exist_ok=True)
BATCH_SIZE = 128
GEN_EPOCHS = 20      # Training time for Diffusion Models
EVAL_EPOCHS = 5      # Training time for the Judge (Classifier)
N_SAMPLES = 2000     # Number of images to generate for stats (Higher = More Rigorous)

# ==========================================
# 1. THE JUDGE (Feature Extractor / Classifier)
# ==========================================
class MNISTClassifier(nn.Module):
    """A standard CNN to extract features and classify digits"""
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
        features = self.fc1(x) # The "Feature Vector"
        x = F.relu(features)
        x = self.dropout2(x)
        x = self.fc2(x)
        if return_features:
            return x, features
        return x

def train_evaluator():
    print("\n--- Training the Judge (Classifier) ---")
    model = MNISTClassifier().to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss()
    
    transform = transforms.Compose([transforms.ToTensor(), transforms.Lambda(lambda t: (t * 2) - 1)])
    dataset = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    model.train()
    for epoch in range(EVAL_EPOCHS):
        for x, y in tqdm(loader, desc=f"Judge Epoch {epoch+1}", leave=False):
            x, y = x.to(DEVICE), y.to(DEVICE)
            optimizer.zero_grad()
            output = model(x)
            loss = criterion(output, y)
            loss.backward()
            optimizer.step()
    print("Judge trained. Ready to evaluate.")
    torch.save(model.state_dict(), str(CKPT / "judge_mnist.pth"))
    return model

# ==========================================
# 2. GENERATIVE MODELS (The Contestants)
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

# ==========================================
# 3. TRAINING ENGINE
# ==========================================
def train_generator(model_class, name):
    print(f"\n--- Training Generator: {name} ---")
    model = model_class().to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    mse = nn.MSELoss()
    scaler = GradScaler('cuda')
    
    transform = transforms.Compose([transforms.ToTensor(), transforms.Lambda(lambda t: (t * 2) - 1)])
    dataset = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
    
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    model.train()
    for epoch in range(GEN_EPOCHS):
        pbar = tqdm(loader, desc=f"Epoch {epoch+1}/{GEN_EPOCHS}", leave=False)
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
    return model

# ==========================================
# 4. STATISTICAL EVALUATION ENGINE
# ==========================================
@torch.no_grad()
def get_features_and_stats(model_gen, model_judge, n_samples):
    model_gen.eval()
    model_judge.eval()
    
    features_list = []
    classes_list = []
    
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    # Generate in batches
    n_batches = n_samples // BATCH_SIZE
    print(f"Generating {n_samples} samples for rigorous stats...")
    
    for _ in tqdm(range(n_batches + 1)):
        # Generate
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
        
        # Normalize to judge input
        x = (x.clamp(-1, 1) + 1) / 2 # 0 to 1
        x = (x * 2) - 1 # -1 to 1 (Classifier expects this)
        
        # Get Stats
        logits, feats = model_judge(x, return_features=True)
        preds = torch.argmax(logits, dim=1)
        
        features_list.append(feats.cpu().numpy())
        classes_list.append(preds.cpu().numpy())
        
    features = np.concatenate(features_list)[:n_samples]
    classes = np.concatenate(classes_list)[:n_samples]
    
    return features, classes

def calculate_fid(mu1, sigma1, mu2, sigma2):
    """Calculates Frechet Distance between two multivariate Gaussians"""
    ssdiff = np.sum((mu1 - mu2)**2.0)
    covmean = sqrtm(sigma1.dot(sigma2))
    if np.iscomplexobj(covmean):
        covmean = covmean.real
    fid = ssdiff + np.trace(sigma1 + sigma2 - 2.0 * covmean)
    return fid

def rigorous_benchmark():
    # 1. Train Judge
    judge = train_evaluator()
    
    # 2. Get Real Data Stats (Baseline)
    transform = transforms.Compose([transforms.ToTensor(), transforms.Lambda(lambda t: (t * 2) - 1)])
    real_dataset = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
    real_loader = DataLoader(real_dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    print("Computing Real Data Statistics...")
    real_feats_list = []
    judge.eval()
    with torch.no_grad():
        for x, _ in tqdm(real_loader, total=len(real_loader), leave=False):
            _, feats = judge(x.to(DEVICE), return_features=True)
            real_feats_list.append(feats.cpu().numpy())
    
    real_features = np.concatenate(real_feats_list)[:N_SAMPLES] # Match sample size
    mu_real = np.mean(real_features, axis=0)
    sigma_real = np.cov(real_features, rowvar=False)
    
    # 3. Train & Test 16-Bit
    gen_16 = train_generator(ResUNet16, "16-Bit Control")

    torch.save(gen_16.state_dict(), str(CKPT / "gen_16bit.pth"))

    feats_16, classes_16 = get_features_and_stats(gen_16, judge, N_SAMPLES)
    
    mu_16 = np.mean(feats_16, axis=0)
    sigma_16 = np.cov(feats_16, rowvar=False)
    fid_16 = calculate_fid(mu_real, sigma_real, mu_16, sigma_16)
    
    # 4. Train & Test 1-Bit
    gen_1 = train_generator(ResUNet1Bit, "1-Bit Experimental")

    torch.save(gen_1.state_dict(), str(CKPT / "gen_1bit.pth"))

    feats_1, classes_1 = get_features_and_stats(gen_1, judge, N_SAMPLES)
    
    mu_1 = np.mean(feats_1, axis=0)
    sigma_1 = np.cov(feats_1, rowvar=False)
    fid_1 = calculate_fid(mu_real, sigma_real, mu_1, sigma_1)
    
    # 5. Report
    print("\n\n" + "="*40)
    print("      FINAL RIGOROUS TEST RESULTS      ")
    print("="*40)
    
    print(f"\nMetric 1: Frechet MNIST Distance (FMD)")
    print(f"Lower is Better. Measures realism.")
    print(f"  > 16-Bit Model: {fid_16:.4f}")
    print(f"  > 1-Bit Model:  {fid_1:.4f}")
    
    print(f"\nMetric 2: Class Coverage (Entropy)")
    print(f"Are all 10 digits generated? (Ideal: ~10% each)")
    unique_16, counts_16 = np.unique(classes_16, return_counts=True)
    unique_1, counts_1 = np.unique(classes_1, return_counts=True)
    
    print("  > 16-Bit Distribution:", dict(zip(unique_16, np.round(counts_16/N_SAMPLES, 2))))
    print("  > 1-Bit Distribution: ", dict(zip(unique_1, np.round(counts_1/N_SAMPLES, 2))))
    
    # Missing classes check
    missing_16 = 10 - len(unique_16)
    missing_1 = 10 - len(unique_1)
    if missing_1 > 0:
        print(f"  !! WARNING: 1-Bit model dropped {missing_1} classes (Mode Collapse).")
    else:
        print(f"  >> SUCCESS: 1-Bit model generated ALL 10 digits.")

# Run it
rigorous_benchmark()

