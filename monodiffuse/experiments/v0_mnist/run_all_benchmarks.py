import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from tqdm import tqdm
from scipy import linalg
from torchvision.models import inception_v3
from torchvision import datasets, transforms
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from models.architectures import ResUNet_FP16, ResUNet_W1A16, ResUNet_W1A1, MNISTClassifier

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FID_SAMPLES = 2000
LEG_SAMPLES = 1000
FID_BATCH = 50
LEG_BATCH = 100

MODELS = {
    "FP16 Native":      {"class": ResUNet_FP16,  "path": r".\pre_trained_models\FP16_and_W1A16\fp16.pth"},
    "W1A16 Native":     {"class": ResUNet_W1A16, "path": r".\pre_trained_models\FP16_and_W1A16\w1a16.pth"},
    "W1A16 PTQ":        {"class": ResUNet_W1A16, "path": r".\pre_trained_models\FP16_and_W1A16\fp16_to_w1a16.pth"},
    "W1A1 Native":      {"class": ResUNet_W1A1,  "path": r".\pre_trained_models\BNN_W1A1\w1a1.pth"},
    "W1A1 PTQ":         {"class": ResUNet_W1A1,  "path": r".\pre_trained_models\BNN_W1A1\fp16_to_w1a1.pth"},
}

JUDGE_PATH = r".\models\judge_mnist.pth"
betas = torch.linspace(1e-4, 0.02, 1000)
alphas = 1. - betas
alphas_cumprod = torch.cumprod(alphas, dim=0)

class InceptionV3FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        self.inception = inception_v3(weights='DEFAULT', transform_input=False)
        self.inception.fc = nn.Identity()
        self.inception.eval()
    def forward(self, x):
        x = F.interpolate(x, size=(299, 299), mode='bilinear', align_corners=False)
        if x.shape[1] == 1:
            x = x.repeat(1, 3, 1, 1)
        return self.inception(x)

@torch.no_grad()
def generate_batch(model, batch_size):
    b = betas.to(DEVICE)
    a = alphas.to(DEVICE)
    ac = alphas_cumprod.to(DEVICE)
    x = torch.randn(batch_size, 1, 28, 28, device=DEVICE)
    for i in reversed(range(1000)):
        t = torch.full((batch_size,), i, device=DEVICE, dtype=torch.long)
        pred = model(x, t)
        ai, aci, bi = a[i], ac[i], b[i]
        noise = torch.randn_like(x) if i > 0 else 0
        x = (1/torch.sqrt(ai)) * (x - ((1-ai)/torch.sqrt(1-aci)) * pred) + torch.sqrt(bi) * noise
    return x.clamp(-1, 1)

def calc_fid(mu1, s1, mu2, s2):
    diff = np.sum((mu1 - mu2)**2)
    covmean = linalg.sqrtm(s1.dot(s2))
    if np.iscomplexobj(covmean):
        covmean = covmean.real
    return diff + np.trace(s1) + np.trace(s2) - 2*np.trace(covmean)

def get_real_stats(inception, n):
    ds = datasets.MNIST(root='./data', train=False, download=True,
                        transform=transforms.Compose([
                            transforms.ToTensor(),
                            transforms.Lambda(lambda t: (t*2)-1)
                        ]))
    loader = torch.utils.data.DataLoader(ds, batch_size=FID_BATCH, shuffle=True)
    feats = []
    count = 0
    with torch.no_grad():
        for x, _ in loader:
            if count >= n: break
            feats.append(inception(x.to(DEVICE)).cpu().numpy())
            count += FID_BATCH
    feats = np.concatenate(feats)[:n]
    return np.mean(feats, axis=0), np.cov(feats, rowvar=False)

def compute_fid(model, inception, mu_real, sigma_real, n):
    feats = []
    nb = n // FID_BATCH
    with torch.no_grad():
        for _ in tqdm(range(nb), desc="  FID gen"):
            imgs = generate_batch(model, FID_BATCH)
            feats.append(inception(imgs).cpu().numpy())
    feats = np.concatenate(feats)
    mu, sigma = np.mean(feats, axis=0), np.cov(feats, rowvar=False)
    return calc_fid(mu_real, sigma_real, mu, sigma)

def compute_legibility(model, judge, n):
    nb = n // LEG_BATCH
    total = 0
    with torch.no_grad():
        for _ in tqdm(range(nb), desc="  Leg gen"):
            imgs = generate_batch(model, LEG_BATCH)
            probs = F.softmax(judge(imgs), dim=1)
            conf, _ = torch.max(probs, dim=1)
            total += conf.mean().item()
    return total / nb

if __name__ == "__main__":
    print(f"Device: {DEVICE}")
    print(f"FID samples: {FID_SAMPLES}, Legibility samples: {LEG_SAMPLES}\n")

    # Load shared resources
    print("Loading InceptionV3...")
    inception = InceptionV3FeatureExtractor().to(DEVICE)
    inception.eval()

    print("Computing real MNIST statistics...")
    mu_real, sigma_real = get_real_stats(inception, FID_SAMPLES)

    print("Loading judge classifier...")
    judge = MNISTClassifier().to(DEVICE)
    judge.load_state_dict(torch.load(JUDGE_PATH, map_location=DEVICE))
    judge.eval()

    results = {}

    for name, cfg in MODELS.items():
        print(f"\n{'='*50}")
        print(f"  {name}")
        print(f"{'='*50}")

        if not os.path.exists(cfg["path"]):
            print(f"  SKIP: {cfg['path']} not found")
            continue

        model = cfg["class"]().to(DEVICE)
        model.load_state_dict(torch.load(cfg["path"], map_location=DEVICE))
        model.eval()

        fid = compute_fid(model, inception, mu_real, sigma_real, FID_SAMPLES)
        leg = compute_legibility(model, judge, LEG_SAMPLES)

        results[name] = {"fid": fid, "legibility": leg * 100}
        print(f"  FID: {fid:.2f}  |  Legibility: {leg*100:.2f}%")

        # Free GPU memory before next model
        del model
        torch.cuda.empty_cache()

    # Summary
    print(f"\n{'='*60}")
    print(f"  FINAL RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"{'Model':<20} {'FID':>10} {'Legibility':>12}")
    print(f"{'-'*42}")
    for name, r in results.items():
        print(f"{name:<20} {r['fid']:>10.2f} {r['legibility']:>11.2f}%")
    print(f"{'='*60}")
