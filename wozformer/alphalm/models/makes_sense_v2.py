import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Helper imports from parent directory
import sys
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector
import config as root_config

class DeepMakesSenseBiGRU(nn.Module):
    def __init__(self, sentence_dim: int = 100, gru_hidden: int = 128, dropout: float = 0.2):
        """
        Deep Makes-Sense v2 Trajectory Evaluator.
        Uses a Bidirectional GRU to model sentence order in a trajectory,
        followed by a classification MLP.
        """
        super().__init__()
        self.gru = nn.GRU(
            input_size=sentence_dim,
            hidden_size=gru_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True
        )
        
        # BiGRU hidden states concatenated (forward + backward) = gru_hidden * 2
        mlp_input_dim = gru_hidden * 2
        
        self.mlp = nn.Sequential(
            nn.Linear(mlp_input_dim, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor of shape [batch_size, seq_len, sentence_dim]
        Returns:
            Coherence score in [0, 1], shape [batch_size, 1]
        """
        # GRU outputs: output [batch_size, seq_len, hidden_size*2], h_n [num_layers*2, batch_size, hidden_size]
        _, h_n = self.gru(x)
        
        # Extract forward and backward hidden states from the last layer
        # h_n shape: [2, batch_size, gru_hidden] for 1 layer bidirectional
        h_forward = h_n[0]
        h_backward = h_n[1]
        
        # Concatenate forward and backward final hidden states
        traj_emb = torch.cat((h_forward, h_backward), dim=1) # shape: [batch_size, gru_hidden * 2]
        
        # Predict coherence score
        out = self.mlp(traj_emb)
        return out


class DeepMakesSenseEvaluatorV2:
    def __init__(self, model_path: Path = None, w2v_path: Path = None):
        """
        Wrapper class for Deep Makes-Sense v2 trajectory evaluator.
        Exposes methods to score single trajectories or batches of candidates.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_path = model_path or root_config.MAKES_SENSE_V2_PATH
        self.w2v_path = w2v_path or (root_config.BASE_DIR / "evaluator" / "evaluator_w2v.model")
        
        # Load Word2Vec
        self.w2v = Word2Vec.load(str(self.w2v_path))
        
        # Initialize and load model
        self.model = DeepMakesSenseBiGRU(
            sentence_dim=self.w2v.vector_size,
            gru_hidden=128,
            dropout=0.0  # Turn off dropout for inference
        )
        
        if self.model_path.exists():
            self.model.load_state_dict(torch.load(str(self.model_path), map_location=self.device, weights_only=True))
        else:
            print(f"Warning: model checkpoint {self.model_path} not found. Using untrained weights.")
            
        self.model.to(self.device)
        self.model.eval()
        
        # Sentence embedding cache to optimize search speed
        self.embedding_cache = {}

    def get_embedding(self, sent: str) -> np.ndarray:
        if sent not in self.embedding_cache:
            tokens = clean_and_tokenize(sent)
            self.embedding_cache[sent] = get_mean_vector(self.w2v, tokens)
        return self.embedding_cache[sent]

    def score_trajectory(self, sentences: list) -> float:
        """
        Scores a list of sentence strings as a sequential trajectory.
        Pads or slices the trajectory to length 6.
        """
        if not sentences:
            return 0.0
            
        max_len = 6
        # Convert sentences to vectors
        embs = [self.get_embedding(s) for s in sentences]
        
        # Pad with zero vectors to max_len
        while len(embs) < max_len:
            embs.insert(0, np.zeros(self.w2v.vector_size, dtype=np.float32))
            
        if len(embs) > max_len:
            embs = embs[-max_len:]
            
        x = torch.tensor(np.array([embs]), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            score = self.model(x).item()
        return score

    def score_candidates(self, history_sentences: list, candidate_sentences: list) -> list:
        """
        Scores a batch of candidate continuation sentences given a trajectory history.
        """
        if not candidate_sentences:
            return []
            
        max_len = 6
        hist_embs = [self.get_embedding(s) for s in history_sentences]
        
        batch_x = []
        for cand in candidate_sentences:
            cand_emb = self.get_embedding(cand)
            combined = hist_embs + [cand_emb]
            
            # Pad with zero vectors to max_len
            while len(combined) < max_len:
                combined.insert(0, np.zeros(self.w2v.vector_size, dtype=np.float32))
                
            if len(combined) > max_len:
                combined = combined[-max_len:]
                
            batch_x.append(combined)
            
        x = torch.tensor(np.array(batch_x), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            outputs = self.model(x)
            scores = outputs.view(-1).cpu().numpy().tolist()
        return scores
