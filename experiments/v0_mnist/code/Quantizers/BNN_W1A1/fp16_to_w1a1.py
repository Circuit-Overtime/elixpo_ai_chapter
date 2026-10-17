import torch
import torch.nn as nn
import torch.nn.functional as F
import math

# ==========================================
# 1. ROBUST QUANTIZATION LAYERS
#    (Matches Runner Logic + Conversion Safety)
# ==========================================

class BitConv2d_Robust(nn.Conv2d):

    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, bias=True):
        # NOTE: bias=True is standard in source models. We keep it to avoid losing information.
        super().__init__(in_channels, out_channels, kernel_size, stride, padding, bias=bias)
    
    def forward(self, x):
        w = self.weight
        
        # 1. Scaling Factor (Per-Tensor L1 Norm)
        alpha = w.abs().mean(dim=(1, 2, 3), keepdim=True)
        
        # 2. Binarization with Detach Trick
        #    Forward:  w_bin = sign(w) * alpha
        #    Backward: d(Loss)/dw = d(Loss)/dw_bin * 1 (Identity STE)
        #    This matches the runner's gradient dynamics exactly.
        w_bin = (w.sign() * alpha - w).detach() + w
        
        return F.conv2d(x, w_bin, self.bias, self.stride, self.padding)

class BinaryActivation(nn.Module):
    def forward(self, x):
        # Standard sign for inference
        return x.sign()

# ==========================================
# 2. ARCHITECTURE DEFINITIONS
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

# --- FP16 Source Architecture ---
class ResBlock16(nn.Module):
    def __init__(self, in_ch, out_ch, time_emb_dim):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        self.bn1 = nn.BatchNorm2d(in_ch)
        self.act1 = nn.SiLU()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=True) # Explicit Bias
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.act2 = nn.SiLU()
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=True) # Explicit Bias
        if in_ch != out_ch:
            self.skip = nn.Conv2d(in_ch, out_ch, 1, bias=True)
        else:
            self.skip = nn.Identity()
            
    def forward(self, x, t):
        h = self.act1(self.bn1(x))
        h = self.conv1(h)
        time_emb = self.time_mlp(t)[(..., ) + (None, ) * 2]
        h = h + time_emb
        h = self.act2(self.bn2(h))
        h = self.conv2(h)
        return h + self.skip(x)

class ResUNet16(nn.Module):
    def __init__(self):
        super().__init__()
        self.channels = [64, 128, 256] 
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.ReLU())
        self.conv0 = nn.Conv2d(1, self.channels[0], 3, padding=1)
        self.down1 = ResBlock16(64, 128, 32)
        self.down2 = ResBlock16(128, 256, 32)
        self.pool = nn.MaxPool2d(2)
        self.up1 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv1 = ResBlock16(256 + 128, 128, 32)
        self.up2 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv2 = ResBlock16(128 + 64, 64, 32)
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

# --- 1-Bit Target Architecture ---
class ResBlockBNN(nn.Module):
    def __init__(self, in_ch, out_ch, time_emb_dim):
        super().__init__()
        self.time_mlp = nn.Linear(time_emb_dim, out_ch)
        
        self.bn1 = nn.BatchNorm2d(in_ch)
        self.act1 = BinaryActivation()
        # ENABLED BIAS=TRUE to match source weights
        self.conv1 = BitConv2d_Robust(in_ch, out_ch, 3, padding=1, bias=True)
        
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.act2 = BinaryActivation()
        # ENABLED BIAS=TRUE to match source weights
        self.conv2 = BitConv2d_Robust(out_ch, out_ch, 3, padding=1, bias=True)
        
        if in_ch != out_ch:
            self.skip = BitConv2d_Robust(in_ch, out_ch, 1, bias=True)
        else:
            self.skip = nn.Identity()
            
    def forward(self, x, t):
        h = self.act1(self.bn1(x))
        h = self.conv1(h)
        h = h + self.time_mlp(t)[(..., ) + (None, ) * 2]
        h = self.act2(self.bn2(h))
        h = self.conv2(h)
        return h + self.skip(x)

class ResUNetBNN_Target(nn.Module):
    def __init__(self):
        super().__init__()
        self.time_mlp = nn.Sequential(SinusoidalPositionEmbeddings(32), nn.Linear(32, 32), nn.GELU())
        
        # Keeping First Layer FP32 (Industry Standard)
        self.conv0 = nn.Conv2d(1, 64, 3, padding=1) 
        
        self.down1 = ResBlockBNN(64, 128, 32)
        self.down2 = ResBlockBNN(128, 256, 32)
        self.pool = nn.MaxPool2d(2)
        
        self.up1 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv1 = ResBlockBNN(256 + 128, 128, 32)
        
        self.up2 = nn.Upsample(scale_factor=2, mode='nearest')
        self.up_conv2 = ResBlockBNN(128 + 64, 64, 32)   
        
        # Keeping Last Layer FP32 (Industry Standard)
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
# 3. SAFE CONVERSION LOGIC
# ==========================================

def quantize_model_robust(fp16_path, save_path):
    print(f"Loading FP16 model from: {fp16_path}")
    
    model_fp16 = ResUNet16()
    model_bnn = ResUNetBNN_Target()
    
    # 1. Load Source Weights
    try:
        # map_location='cpu' prevents GPU VRAM spikes during conversion
        state_dict_fp16 = torch.load(fp16_path, map_location='cpu')
        model_fp16.load_state_dict(state_dict_fp16)
        print("FP16 State Dict loaded successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR loading FP16 model: {e}")
        return

    print("Starting Safe Conversion...")
    
    bnn_dict = model_bnn.state_dict()
    fp16_dict = model_fp16.state_dict()
    
    converted_count = 0
    missing_keys = []
    
    with torch.no_grad():
        for key in bnn_dict.keys():
            if key in fp16_dict:
                src_tensor = fp16_dict[key]
                target_tensor = bnn_dict[key]
                
                # Check shapes match
                if src_tensor.shape != target_tensor.shape:
                    print(f"SHAPE MISMATCH at {key}: Src {src_tensor.shape} != Tgt {target_tensor.shape}")
                    continue
                
                # CRITICAL FIX: Safe Casting
                # Convert fp16 -> float32 to prevent dtype errors in the runner
                bnn_dict[key] = src_tensor.float()
                
                converted_count += 1
            else:
                # Track missing keys (often running_mean/var if not tracked, or biases)
                missing_keys.append(key)

    # 2. Strictness Report
    if missing_keys:
        print(f"\nWARNING: {len(missing_keys)} keys were missing in source and not loaded:")
        for k in missing_keys[:5]: print(f" - {k}")
        if len(missing_keys) > 5: print(" ... and others.")
        print("Ensure these are not critical (e.g., BN statistics or Biases).")
    
    # 3. Load into BNN (Safe Load)
    model_bnn.load_state_dict(bnn_dict)
    
    # 4. Save
    torch.save(model_bnn.state_dict(), save_path)
    print(f"\nSUCCESS: Converted {converted_count} tensors.")
    print(f"Robust Quantized Model saved to: {save_path}")

if __name__ == "__main__":
    
    PATH_IN = r".\pre_trained_models\FP16_and_W1A16\fp16.pth" 
    PATH_OUT = r".\pre_trained_models\FP16_and_W1A16\w1a16.pth"
    
    quantize_model_robust(PATH_IN, PATH_OUT)


    
 