import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import os
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.utils import save_image
from tqdm import tqdm
import matplotlib.pyplot as plt
from PIL import Image
from models.architectures import ResUNet_W1A1

# =======================
# CONFIGURATION
# =======================
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 16
LR = 1e-4
EPOCHS = 100
IMG_SIZE = 28
CHANNELS = 1
SAVE_DIR = r".\Trained_models\w1a1_diffusion_checkpoints"

os.makedirs(SAVE_DIR, exist_ok=True)


# =======================
# 4. HELPERS AND TRAINING
# =======================
def get_dataloader():
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Lambda(lambda t: (t * 2) - 1) # Scale to [-1, 1]
    ])
    dataset = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
    return DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)

@torch.no_grad()
def sample_and_display(model, epoch):
    model.eval()
    n = 16
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)
    
    # Start from random noise
    x = torch.randn(n, CHANNELS, IMG_SIZE, IMG_SIZE).to(DEVICE)
    
    for i in reversed(range(1000)):
        t = torch.full((n,), i, device=DEVICE, dtype=torch.long)
        pred_noise = model(x, t)
        
        alpha = alphas[i]
        alpha_bar = alphas_cumprod[i]
        beta = betas[i]
        
        if i > 0:
            noise = torch.randn_like(x)
        else:
            noise = 0
            
        x = (1 / torch.sqrt(alpha)) * (x - ((1 - alpha) / torch.sqrt(1 - alpha_bar)) * pred_noise) + torch.sqrt(beta) * noise
        
    x = (x.clamp(-1, 1) + 1) / 2
    
    save_path = os.path.join(SAVE_DIR, "bnn_generated.png")
    save_image(x, save_path, nrow=4)
    
    # Display the image if possible
    try:
        #img = Image.open(save_path)
        #plt.figure(figsize=(6,6))
        #plt.imshow(img, cmap='gray')
        #plt.axis('off')
        #plt.title(f"BNN Generation - Epoch {epoch}")
        #plt.show()
        #plt.close() # Close plot to prevent memory leaks in loop
        print("Saved generated output!")
    except Exception as e:
        pass # Headless environment, just save

    model.train()

def train():
    dataloader = get_dataloader()
    model = ResUNet_W1A1().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR)
    loss_fn = nn.MSELoss()
    
    betas = torch.linspace(1e-4, 0.02, 1000).to(DEVICE)
    alphas = 1. - betas
    alphas_cumprod = torch.cumprod(alphas, dim=0)

    print(f"Starting BNN Training on {DEVICE}...")
    
    for epoch in range(EPOCHS):
        pbar = tqdm(dataloader)
        total_loss = 0
        for x0, _ in pbar:
            x0 = x0.to(DEVICE)
            t = torch.randint(0, 1000, (x0.shape[0],), device=DEVICE).long()
            noise = torch.randn_like(x0)
            
            alpha_bar = alphas_cumprod[t][:, None, None, None]
            noisy_image = torch.sqrt(alpha_bar) * x0 + torch.sqrt(1 - alpha_bar) * noise
            
            noise_pred = model(noisy_image, t)
            loss = loss_fn(noise_pred, noise)
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            pbar.set_description(f"Epoch {epoch}| Loss: {loss.item():.4f}")
            
        avg_loss = total_loss / len(dataloader)
        print(f"Epoch {epoch} Finished. Average Loss: {avg_loss:.4f}")
        
        torch.save(model.state_dict(), os.path.join(SAVE_DIR, f"bnn_model_epoch_{epoch}.pth"))
        sample_and_display(model, epoch)

if __name__ == "__main__":
    train()