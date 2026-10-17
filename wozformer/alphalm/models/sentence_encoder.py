import torch
import torch.nn as nn
import numpy as np

class TokenLevelSentenceEncoder(nn.Module):
    def __init__(
        self,
        vocab_size: int,
        embedding_dim: int = 128,
        d_model: int = 128,
        n_heads: int = 4,
        n_layers: int = 2,
        d_ff: int = 256,
        dropout: float = 0.2,
        max_len: int = 30,
        pretrained_weights=None,
        freeze_emb: bool = False
    ):
        super().__init__()
        
        if pretrained_weights is not None:
            self.embedding = nn.Embedding.from_pretrained(
                torch.tensor(pretrained_weights, dtype=torch.float32),
                freeze=freeze_emb,
                padding_idx=0
            )
        else:
            self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
            
        self.emb_dropout = nn.Dropout(dropout)
        
        if embedding_dim != d_model:
            self.proj = nn.Linear(embedding_dim, d_model)
        else:
            self.proj = nn.Identity()
            
        self.pos_emb = nn.Parameter(torch.zeros(1, max_len, d_model))
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_ff,
            dropout=dropout,
            activation='relu',
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        
        # LayerNorm on the pooled output to stabilize representations and prevent
        # embedding collapse during end-to-end training through downstream models
        self.output_norm = nn.LayerNorm(d_model * 2)
        
        nn.init.normal_(self.pos_emb, std=0.02)
        
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # x: [batch_size, seq_len]
        if mask is None:
            mask = (x == 0) # [batch_size, seq_len] (True where token is padding)
            
        embedded = self.embedding(x) # [batch_size, seq_len, embedding_dim]
        embedded = self.emb_dropout(embedded)
        
        h = self.proj(embedded) # [batch_size, seq_len, d_model]
        h = h + self.pos_emb[:, :h.size(1), :]
        
        # Pass to Transformer Encoder
        out = self.transformer(h, src_key_padding_mask=mask) # [batch_size, seq_len, d_model]
        
        # Mean + Max Pooling
        # Check if the entire sequence is masked (fully padded)
        all_masked = mask.all(dim=1, keepdim=True) # [batch_size, 1]

        # Create a float mask: 1 for real tokens, 0 for pad
        float_mask = (~mask).float().unsqueeze(-1) # [batch_size, seq_len, 1]
        sum_out = torch.sum(out * float_mask, dim=1)
        num_tokens = torch.clamp(float_mask.sum(dim=1), min=1e-9)
        mean_pool = sum_out / num_tokens
        
        # For max pooling, replace pad values with a large negative number
        masked_out = out.clone()
        masked_out[mask] = -1e9
        max_pool, _ = torch.max(masked_out, dim=1)
        
        pooled = torch.cat((mean_pool, max_pool), dim=1) # [batch_size, d_model * 2]
        
        # If all masked, replace the pooled representation with zero vectors to avoid NaN gradients from -1e9 max pooling
        pooled = torch.where(all_masked, torch.zeros_like(pooled), pooled)
        
        # Normalize output to stabilize downstream training
        pooled = self.output_norm(pooled)
        return pooled


