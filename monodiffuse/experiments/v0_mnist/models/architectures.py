import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm
import os


# ==========================================
# 0. File-level summary (read first)
# ==========================================
# This file implements several UNet-style architectures targeted at MNIST diffusion:
# - ResUNet_FP16      : a standard (full-precision) residual UNet (baseline)
# - ResUNet_W1A16    : uses binary *weights* with full-precision activations (W1A16)
# - ResUNet_W1A1     : a true BNN variant (binary weights + binary activations)
# Also includes a small classifier (MNISTClassifier) used as a judge/metric or debugging tool.
# Time embeddings use sinusoidal positional embeddings and are injected additively inside ResBlocks.
#
# Important design notes:
# - ResBlocks use a pre-activation ordering (BN -> activation -> conv), similar to "pre-activation ResNet".
# - Two different binary conv strategies are present:
#    * BitConv2d_Std: centers weights before binarizing (w - mean) and scales by channel mean abs
#    * BitConv2d_BNN: no centering; scales by mean abs (alpha) — intended for strict BNN experiments.
# - Binary activation uses a custom autograd function with a straight-through / clipped-gradient surrogate.
# - Time embedding broadcasting uses the trick: time_mlp(t)[(...,) + (None,)*2] to make it (B,C,1,1).


# ==========================================
# 1. SHARED COMPONENTS
# ==========================================
class SinusoidalPositionEmbeddings(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.dim = dim
    def forward(self, time):
        # Standard sinusoidal time embedding: stable, no learned parameters.
        # Produces shape (batch, dim). Good for diffusion because it gives smoothly varying embeddings for timesteps.
        device = time.device
        half_dim = self.dim // 2
        embeddings = math.log(10000) / (half_dim - 1)
        embeddings = torch.exp(torch.arange(half_dim, device=device) * -embeddings)
        embeddings = time[:, None] * embeddings[None, :]
        embeddings = torch.cat((embeddings.sin(), embeddings.cos()), dim=-1)
        return embeddings


# ==========================================
# 2. GROUP A: ORIGINAL RES-UNET (16-bit & 1-bit)
# ==========================================
# These ResBlocks and UNets are architecturally identical across FP16 and quantized variants,
# the difference is in which Conv2d subclass they use (regular Conv2d vs. BitConv2d_Std).


# --- 16-BIT CLASSES ---
class ResBlock16(nn.Module):
    """
    Pre-activation residual block for the FP16 (full precision) model.
    - time_mlp projects the time embedding to match the block's output channels,
      then is broadcasted and added to the convolutional feature map (simple conditional bias).
    - BatchNorm applied before activation (pre-activation), which often stabilizes training.
    """
    def __init__(self, in_ch, out_ch, time_emb_dim):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        self.bn1 = nn.BatchNorm2d(in_ch)   # normalizing input channels before first conv
        self.act1 = nn.SiLU()              # smooth nonlinearity (swish-like)
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.act2 = nn.SiLU()
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
        # Residual skip: 1x1 conv to match channels when needed
        if in_ch != out_ch:
            self.skip = nn.Conv2d(in_ch, out_ch, 1)
        else:
            self.skip = nn.Identity()
            
    def forward(self, x, t):
        # x: (B, C, H, W), t: (B, time_emb_dim)
        # pre-activation style: bn -> act -> conv
        h = self.act1(self.bn1(x))
        h = self.conv1(h)
        # project time embedding and add (broadcast to spatial dims)
        time_emb = self.time_mlp(t)[(..., ) + (None, ) * 2]
        h = h + time_emb
        h = self.act2(self.bn2(h))
        h = self.conv2(h)
        return h + self.skip(x)


class ResUNet_FP16(nn.Module):
    """
    Small residual UNet for MNIST (single-channel).
    - channels = [64,128,256] => shallow UNet (two downsampling steps).
    - Uses nearest upsampling and concatenation skip connections.
    - Final conv outputs single-channel reconstruction/prediction (e.g., predicted noise).
    """
    def __init__(self):
        super().__init__()
        self.channels = [64, 128, 256] 
        # time MLP: sinusoidal embedding -> small MLP
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.ReLU())
        self.conv0 = nn.Conv2d(1, self.channels[0], 3, padding=1)
        self.down1 = ResBlock16(64, 128, 32)
        self.down2 = ResBlock16(128, 256, 32)
        self.pool = nn.MaxPool2d(2)
        self.up1 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv1 = ResBlock16(256 + 128, 128, 32)  # concat along channels
        self.up2 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv2 = ResBlock16(128 + 64, 64, 32)
        self.output = nn.Conv2d(64, 1, 1)

    def forward(self, x, t):
        # Typical UNet forward: encode -> bottleneck -> decode with skips
        t_emb = self.time_mlp(t)
        x0 = self.conv0(x)           # first feature map
        x1 = self.pool(x0)           # downsample spatially
        x1 = self.down1(x1, t_emb)
        x2 = self.pool(x1)
        x2 = self.down2(x2, t_emb)
        x_up1 = self.up1(x2)
        x_up1 = torch.cat([x_up1, x1], dim=1) 
        x_up1 = self.up_conv1(x_up1, t_emb)
        x_up2 = self.up2(x_up1)
        x_up2 = torch.cat([x_up2, x0], dim=1)
        x_up2 = self.up_conv2(x_up2, t_emb)
        return self.output(x_up2)


# --- W1A16 ---
# Here, activations are kept in higher precision (likely fp16/fp32 at runtime), but weights are
# binarized on-the-fly inside BitConv2d_Std. This is a common compromise: keep activation richness
# while reducing memory and compute for weights.


class BitConv2d_Std(nn.Conv2d):
    """
    Weight-binarizing Conv2d with *centering* (w - mean) and channel-wise scaling.
    - Centering removes per-filter mean, which often improves binary approximation (weights become zero-mean).
    - scale = mean(abs(centered_weights)) => single scaling factor per output channel
    - w_final = (w_bin - w).detach() + w => uses STE-like trick: forward uses w_bin but gradients flow into w.
    """
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=False):
        super().__init__(in_channels, out_channels, kernel_size, stride, padding, bias=bias)
    def forward(self, x):
        w = self.weight
        # center per-output-channel (keeps spatial dims/ in/out channels considered)
        w_centered = w - w.mean(dim=(1,2,3), keepdim=True) # <-- Centered
        # scaling factor: mean absolute value of centered weights
        scale = w_centered.abs().mean(dim=(1,2,3), keepdim=True)
        w_bin = torch.sign(w_centered) * scale   # binarized and re-scaled
        # STE: use w_bin in forward, but gradient flows to original w
        w_final = (w_bin - w).detach() + w 
        return F.conv2d(x, w_final, self.bias, self.stride, self.padding)


class ResBlock1Bit(nn.Module):
    """
    Res block that uses BitConv2d_Std. Same pre-activation ordering as ResBlock16.
    Intuition: by centering and scaling weights, the binary approximation preserves both sign and a magnitude proxy.
    """
    def __init__(self, in_ch, out_ch, time_emb_dim):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        self.bn1 = nn.BatchNorm2d(in_ch)
        self.act1 = nn.SiLU()
        # use binary-weight conv here
        self.conv1 = BitConv2d_Std(in_ch, out_ch, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.act2 = nn.SiLU()
        self.conv2 = BitConv2d_Std(out_ch, out_ch, 3, padding=1)
        if in_ch != out_ch:
            # skip is also binary-weight conv to keep quantized path consistent
            self.skip = BitConv2d_Std(in_ch, out_ch, 1)
        else:
            self.skip = nn.Identity()
    def forward(self, x, t):
        h = self.act1(self.bn1(x))
        h = self.conv1(h)
        # time emb broadcast and add
        h = h + self.time_mlp(t)[(..., ) + (None, ) * 2]
        h = self.act2(self.bn2(h))
        h = self.conv2(h)
        return h + self.skip(x)


class ResUNet_W1A16(nn.Module):
    """
    UNet variant with binarized weights (via BitConv2d_Std) and full-precision activations.
    This is often a sweet spot: most compute/memory saved from weight binarization, while activations keep expressivity.
    """
    def __init__(self):
        super().__init__()
        self.channels = [64, 128, 256] 
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.ReLU())
        
        self.conv0 = nn.Conv2d(1, self.channels[0], 3, padding=1)
        
        self.down1 = ResBlock1Bit(64, 128, 32)
        self.down2 = ResBlock1Bit(128, 256, 32)
        
        self.pool = nn.MaxPool2d(2)
        
        self.up1 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv1 = ResBlock1Bit(256 + 128, 128, 32)
        
        self.up2 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv2 = ResBlock1Bit(128 + 64, 64, 32)
        
        self.output = nn.Conv2d(64, 1, 1)

    def forward(self, x, t):
        t_emb = self.time_mlp(t)
        x0 = self.conv0(x)
        x1 = self.pool(x0)
        x1 = self.down1(x1, t_emb)
        x2 = self.pool(x1)
        x2 = self.down2(x2, t_emb)
        
        x_up1 = self.up1(x2)
        x_up1 = torch.cat([x_up1, x1], dim=1) 
        x_up1 = self.up_conv1(x_up1, t_emb)
        
        x_up2 = self.up2(x_up1)
        x_up2 = torch.cat([x_up2, x0], dim=1)
        x_up2 = self.up_conv2(x_up2, t_emb)
        return self.output(x_up2)


# ==========================================
# 3. GROUP B: W1A1 (The True "BNN")
# ==========================================
# This group targets full binarization: binary activations + binary weights.
# That is much harder to optimize; special gradient surrogates and careful normalization are important.
# This code includes a custom binary activation with a clipped-gradient STE and a BitConv variant without centering.


class BinaryActivation_BNN(torch.autograd.Function):
    """
    Custom binary activation function:
    - forward: sign(x) => outputs {-1, +1}
    - backward: a clipped gradient surrogate: gradients outside |x|>1 set to 0.
      This is a simple STE variant that prevents gradients for inputs that are saturated far from zero.
    """
    @staticmethod
    def forward(ctx, input):
        ctx.save_for_backward(input)
        return input.sign()
    @staticmethod
    def backward(ctx, grad_output):
        input, = ctx.saved_tensors
        grad_input = grad_output.clone()
        # zero gradient for inputs with |x| > 1 (simple clipping region)
        grad_input[input.abs() > 1] = 0
        return grad_input


class BinaryTanh_BNN(nn.Module):
    # thin wrapper so ResBlockBNN can use a module-like activation
    def __init__(self):
        super().__init__()
    def forward(self, x):
        return BinaryActivation_BNN.apply(x)


class BitConv2d_BNN(nn.Conv2d):
    """
    Binary-weight conv used in the strict BNN.
    NOTE: this variant *does not center* weights before computing alpha.
    - alpha = mean(abs(w)) (per-output-channel scaling)
    - w_bin = sign(w) * alpha
    - forward returns conv with w_bin (via STE trick).
    Difference vs BitConv2d_Std:
      * No centering step (so per-filter bias remains inside binarization).
      * This choice matches some BNN literature where centering is omitted, but results and stability can differ.
    """
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=False):
        super().__init__(in_channels, out_channels, kernel_size, stride, padding, bias=bias)
    def forward(self, x):
        w = self.weight
        alpha = w.abs().mean(dim=(1,2,3), keepdim=True) # <-- Not centered
        # STE pattern: produce a binarized tensor for forward but let gradients flow into w
        w_bin = (w.sign() * alpha - w).detach() + w
        return F.conv2d(x, w_bin, self.bias, self.stride, self.padding)


class ResBlockBNN(nn.Module):
    """
    Residual block for strict BNN:
    - BatchNorm followed by Binary activation (BinaryTanh_BNN).
    - Convolutions use BitConv2d_BNN (binary weights, no centering).
    - Skip uses BitConv2d_BNN if channels change, keeping the whole path binary-aware.
    Caution: BatchNorm + binary activation is common in BNNs (BN helps keep activations in a trainable range).
    """
    def __init__(self, in_ch, out_ch, time_emb_dim):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        self.bn1 = nn.BatchNorm2d(in_ch)
        self.act1 = BinaryTanh_BNN()
        self.conv1 = BitConv2d_BNN(in_ch, out_ch, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.act2 = BinaryTanh_BNN()
        self.conv2 = BitConv2d_BNN(out_ch, out_ch, 3, padding=1)
        if in_ch != out_ch:
            self.skip = BitConv2d_BNN(in_ch, out_ch, 1)
        else:
            self.skip = nn.Identity()
    def forward(self, x, t):
        h = self.act1(self.bn1(x))
        h = self.conv1(h)
        h = h + self.time_mlp(t)[(..., ) + (None, ) * 2]
        h = self.act2(self.bn2(h))
        h = self.conv2(h)
        return h + self.skip(x)


class ResUNet_W1A1(nn.Module):
    # NO weight centering is being done
    """
    Full BNN UNet: binary activations + binary weights.
    - time MLP uses GELU instead of ReLU/SiLU — minor choice.
    - Because everything is binary, BatchNorm placement, initialization, and learning rates are critical.
  
    """
    def __init__(self):
        super().__init__()
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.GELU())
        self.conv0 = nn.Conv2d(1, 64, 3, padding=1)
        self.down1 = ResBlockBNN(64, 128, 32)
        self.down2 = ResBlockBNN(128, 256, 32)
        self.pool = nn.MaxPool2d(2)
        self.up1 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv1 = ResBlockBNN(256 + 128, 128, 32) 
        self.up2 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv2 = ResBlockBNN(128 + 64, 64, 32)    
        self.output = nn.Conv2d(64, 1, 1)
    def forward(self, x, t):
        t_emb = self.time_mlp(t)
        x0 = self.conv0(x) 
        x1 = self.pool(x0)         
        x1 = self.down1(x1, t_emb) 
        x2 = self.pool(x1)         
        x2 = self.down2(x2, t_emb) 
        x_up1 = self.up1(x2)       
        x_up1 = torch.cat([x_up1, x1], dim=1) 
        x_up1 = self.up_conv1(x_up1, t_emb)   
        x_up2 = self.up2(x_up1)    
        x_up2 = torch.cat([x_up2, x0], dim=1) 
        x_up2 = self.up_conv2(x_up2, t_emb)   
        return self.output(x_up2)
    



# ==========================================
# 4. JUDGE ARCHITECTURE
# ==========================================
class MNISTClassifier(nn.Module):
    """
    Small conv classifier used to judge sample quality or for debugging.
    - Not state-of-the-art, but adequate for MNIST sanity checks.
    - Flattening size (9216) assumes specific input spatial dims after conv+pool: verify if you change image resolution.
    """
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, 1)
        self.conv2 = nn.Conv2d(32, 64, 3, 1)
        self.dropout1 = nn.Dropout(0.25)
        self.dropout2 = nn.Dropout(0.5)
        self.fc1 = nn.Linear(9216, 128)  # depends on input shape; 28x28 -> conv/pool -> verify if you change sizes
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.conv1(x)
        x = F.relu(x)
        x = self.conv2(x)
        x = F.relu(x)
        x = F.max_pool2d(x, 2)
        x = self.dropout1(x)
        x = torch.flatten(x, 1)
        x = self.fc1(x)
        x = F.relu(x)
        x = self.dropout2(x)
        x = self.fc2(x)
        return x