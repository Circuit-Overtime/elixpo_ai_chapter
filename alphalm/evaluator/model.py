import sys
import torch
import torch.nn as nn
from pathlib import Path

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

import evaluator.eval_config as eval_config

class MakesSenseMLP(nn.Module):
    def __init__(self, input_dim: int, hidden_layers: list, dropout: float = 0.2):
        """
        Multi-layer Perceptron (MLP) for scoring the coherence (makes-sense probability)
        of a concatenated embedding trajectory.
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
