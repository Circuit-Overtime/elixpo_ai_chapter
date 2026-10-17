import torch
import torch.nn as nn

class AlphaLMPolicyMLP(nn.Module):
    def __init__(self, input_dim: int, hidden_layers: list, dropout: float = 0.2):
        """
        Multi-layer Perceptron (MLP) for scoring candidate search survival likelihood.
        Takes concatenated context/candidate embeddings (and optional scalar features)
        and outputs a survival probability in [0, 1].
        """
        super().__init__()
        layers = []
        prev_dim = input_dim
        for h_dim in hidden_layers:
            layers.append(nn.Linear(prev_dim, h_dim))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout))
            prev_dim = h_dim
            
        layers.append(nn.Linear(prev_dim, 1))
        layers.append(nn.Sigmoid())
        
        self.mlp = nn.Sequential(*layers)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.mlp(x)


from models.sentence_encoder import TokenLevelSentenceEncoder

class AlphaLMPolicyMLPV652(nn.Module):
    def __init__(self, vocab_size: int, embedding_dim: int = 128, d_model: int = 128, n_heads: int = 4, n_layers: int = 2, d_ff: int = 256, dropout: float = 0.2, max_len_sent: int = 30, pretrained_weights=None, freeze_emb: bool = False, window_size: int = 4, hidden_layers: list = [512, 256, 64], policy_dropout: float = 0.2):
        super().__init__()
        self.sentence_encoder = TokenLevelSentenceEncoder(
            vocab_size=vocab_size,
            embedding_dim=embedding_dim,
            d_model=d_model,
            n_heads=n_heads,
            n_layers=n_layers,
            d_ff=d_ff,
            dropout=dropout,
            max_len=max_len_sent,
            pretrained_weights=pretrained_weights,
            freeze_emb=freeze_emb
        )
        
        self.window_size = window_size
        sentence_emb_dim = d_model * 2
        input_dim = window_size * sentence_emb_dim
        
        self.mlp = AlphaLMPolicyMLP(
            input_dim=input_dim,
            hidden_layers=hidden_layers,
            dropout=policy_dropout
        )
        
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        batch_size, win_size, sent_len = x.shape
        x_flat = x.view(batch_size * win_size, sent_len)
        mask_flat = mask.view(batch_size * win_size, sent_len) if mask is not None else None
        
        sent_embs = self.sentence_encoder(x_flat, mask_flat)
        sent_embs = sent_embs.view(batch_size, win_size * sent_embs.size(-1))
        
        return self.mlp(sent_embs)

