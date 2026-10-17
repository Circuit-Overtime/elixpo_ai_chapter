import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import matplotlib.pyplot as plt
import numpy as np
import scipy.ndimage as ndimage  # for Median Filtering
from tqdm import tqdm
from models.architectures import ResUNet_FP16, ResUNet_W1A16



# ==========================================
# 3. CONVERSION, GENERATION, AND FILTERING
# ==========================================

def quantize_and_generate(fp16_path, save_path, num_samples=16, timesteps=1000, device="cuda" if torch.cuda.is_available() else "cpu"):
    
    # --- PHASE 1: CONVERSION ---
    print(f"Loading FP16 model from: {fp16_path}")
    model_fp16 = ResUNet_FP16()
    model_bnn = ResUNet_W1A16()
    
    try:
        state_dict_fp16 = torch.load(fp16_path, map_location='cpu')
        model_fp16.load_state_dict(state_dict_fp16)
        print("FP16 State Dict loaded successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR loading FP16 model: {e}")
        return

    print("Starting W1A16 Conversion...")
    bnn_dict = model_bnn.state_dict()
    fp16_dict = model_fp16.state_dict()
    
    with torch.no_grad():
        for key in bnn_dict.keys():
            if key in fp16_dict:
                bnn_dict[key] = fp16_dict[key].float() 

    model_bnn.load_state_dict(bnn_dict)
    torch.save(model_bnn.state_dict(), save_path)
    
    # --- PHASE 2: GENERATION (DDPM Logic) ---
    print(f"\nGenerating {num_samples} samples using W1A16 Lobotomized Model on {device}...")
    model_bnn.to(device)
    model_bnn.eval()

    beta_start = 0.0001
    beta_end = 0.02
    betas = torch.linspace(beta_start, beta_end, timesteps).to(device)
    alphas = 1.0 - betas
    alphas_cumprod = torch.cumprod(alphas, axis=0)
    alphas_cumprod_prev = F.pad(alphas_cumprod[:-1], (1, 0), value=1.0)
    posterior_variance = betas * (1. - alphas_cumprod_prev) / (1. - alphas_cumprod)

    def extract(a, t, x_shape):
        b, *_ = t.shape
        out = a.gather(-1, t)
        return out.reshape(b, *((1,) * (len(x_shape) - 1)))

    @torch.no_grad()
    def p_sample(model, x, t, t_index):
        betas_t = extract(betas, t, x.shape)
        sqrt_one_minus_alphas_cumprod_t = extract(torch.sqrt(1. - alphas_cumprod), t, x.shape)
        sqrt_recip_alphas_t = extract(torch.sqrt(1.0 / alphas), t, x.shape)
        
        model_mean = sqrt_recip_alphas_t * (x - betas_t * model(x, t) / sqrt_one_minus_alphas_cumprod_t)

        if t_index == 0:
            return model_mean
        else:
            posterior_variance_t = extract(posterior_variance, t, x.shape)
            noise = torch.randn_like(x)
            return model_mean + torch.sqrt(posterior_variance_t) * noise 

    @torch.no_grad()
    def p_sample_loop(model, shape):
        b = shape[0]
        img = torch.randn(shape, device=device)
        for i in tqdm(reversed(range(0, timesteps)), desc='Denoising loop', total=timesteps):
            img = p_sample(model, img, torch.full((b,), i, device=device, dtype=torch.long), i)
        return img

    samples = p_sample_loop(model_bnn, shape=(num_samples, 1, 28, 28))
    
    samples = (samples + 1) / 2 
    samples = samples.clamp(0, 1).cpu().numpy()

    # --- PHASE 3: POST-PROCESSING (Salt-Pepper Denoise / Median Filter) ---
    print("\nApplying Median Filter for Salt-and-Pepper noise removal...")
    filtered_samples = np.zeros_like(samples)
    for i in range(num_samples):
        # Apply a 3x3 median filter to the 28x28 image grid
        filtered_samples[i][0] = ndimage.median_filter(samples[i][0], size=3)

    # --- PHASE 4: PLOTTING ---
    fig, axes = plt.subplots(4, 4, figsize=(8, 8))
    fig.suptitle("W1A16 Lobotomized Generation (Post Median Filter)", fontsize=16)
    
    for i, ax in enumerate(axes.flatten()):
        if i < num_samples:
            ax.imshow(filtered_samples[i][0], cmap='gray')
        ax.axis('off')
    
    plt.tight_layout()
    plt.savefig(r".\FP16_and_W1A16\w1a16_lobotomized_filtered_output.png")
    print(f"Saved filtered generation grid to: w1a16_lobotomized_filtered_output.png")

if __name__ == "__main__":
    PATH_IN = r".\pre_trained_models\FP16_and_W1A16\fp16.pth"
    PATH_OUT = r".\pre_trained_models\FP16_and_W1A16\new_fp16_to_w1a16.pth"
    
    quantize_and_generate(PATH_IN, PATH_OUT, num_samples=16)