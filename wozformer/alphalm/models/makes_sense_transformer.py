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

class MakesSenseTransformer(nn.Module):
    def __init__(self, sentence_dim: int = 100, hidden_dim: int = 128, num_heads: int = 4, num_layers: int = 2, dim_feedforward: int = 256, dropout: float = 0.2, max_len: int = 6):
        """
        AlphaLM Makes-Sense Transformer Trajectory Evaluator.
        Uses a Transformer Encoder stack to compare all sentences in the trajectory.
        """
        super().__init__()
        # Input projection layer to match hidden dimension
        if sentence_dim != hidden_dim:
            self.proj = nn.Linear(sentence_dim, hidden_dim)
        else:
            self.proj = nn.Identity()
            
        # Learned positional embeddings for sequence length max_len
        self.pos_emb = nn.Parameter(torch.zeros(1, max_len, hidden_dim))
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=num_heads,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation='relu',
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        # Layer Normalization for stability
        self.layer_norm = nn.LayerNorm(hidden_dim * 2)
        
        # Classification MLP
        self.mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2, 128),
            nn.LayerNorm(128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        # Initialize positional embeddings
        nn.init.normal_(self.pos_emb, std=0.02)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor of shape [batch_size, seq_len, sentence_dim]
        Returns:
            Coherence score in [0, 1], shape [batch_size, 1]
        """
        # Project inputs
        h = self.proj(x) # [batch_size, seq_len, hidden_dim]
        
        # Add positional embedding
        h = h + self.pos_emb
        
        # Pass through Transformer encoder
        out = self.transformer(h) # [batch_size, seq_len, hidden_dim]
        
        # Concatenate mean pooling and max pooling over the sequence dimension
        mean_pool = out.mean(dim=1) # [batch_size, hidden_dim]
        max_pool, _ = out.max(dim=1) # [batch_size, hidden_dim]
        pooled = torch.cat((mean_pool, max_pool), dim=1) # [batch_size, hidden_dim * 2]
        
        pooled = self.layer_norm(pooled)
        
        return self.mlp(pooled)


class DeepMakesSenseEvaluatorTransformer:
    def __init__(self, model_path: Path = None, w2v_path: Path = None):
        """
        Wrapper class for Deep Makes-Sense Transformer trajectory evaluator.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_path = model_path or getattr(root_config, "MAKES_SENSE_TRANSFORMER_PATH", root_config.BASE_DIR / "models" / "makes_sense_tinystories_transformer.pt")
        self.w2v_path = w2v_path or (root_config.BASE_DIR / "evaluator" / "evaluator_w2v.model")
        
        # Load Word2Vec
        self.w2v = Word2Vec.load(str(self.w2v_path))
        
        # Initialize model
        self.model = MakesSenseTransformer(
            sentence_dim=self.w2v.vector_size,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
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
        Pads prefix with zero vectors up to length 6.
        """
        if not sentences:
            return 0.0
            
        max_len = 6
        embs = [self.get_embedding(s) for s in sentences]
        
        # Prefix Padding (insert zeros at the beginning)
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
            
            # Prefix Padding (insert zeros at the beginning)
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


from models.sentence_encoder import TokenLevelSentenceEncoder

class MakesSenseTransformerV652(nn.Module):
    def __init__(self, vocab_size: int, embedding_dim: int = 128, d_model: int = 128, n_heads: int = 4, n_layers: int = 2, d_ff: int = 256, dropout: float = 0.2, max_len_sent: int = 30, pretrained_weights=None, freeze_emb: bool = False):
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
        # Note: Pooling output dimension is d_model * 2 (256).
        # trajectory_transformer's sentence_dim is 256. It projects 256 to 128 (hidden_dim) dynamically.
        self.trajectory_transformer = MakesSenseTransformer(
            sentence_dim=d_model * 2,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
            dropout=dropout,
            max_len=6
        )
        
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # x: [batch_size, trajectory_len, max_len_sent] token IDs
        # mask: [batch_size, trajectory_len, max_len_sent] boolean masks
        batch_size, traj_len, sent_len = x.shape
        x_flat = x.view(batch_size * traj_len, sent_len)
        mask_flat = mask.view(batch_size * traj_len, sent_len) if mask is not None else None
        
        sent_embs = self.sentence_encoder(x_flat, mask_flat) # [batch_size * traj_len, d_model * 2]
        sent_embs = sent_embs.view(batch_size, traj_len, -1) # [batch_size, traj_len, d_model * 2]
        
        return self.trajectory_transformer(sent_embs)


class TokenEmbeddingCacheMS(dict):
    def __init__(self, evaluator):
        super().__init__()
        self.evaluator = evaluator
        
    def __setitem__(self, key, value):
        if key in self:
            return
        super().__setitem__(key, self.evaluator.compute_sentence_embedding(key))


class DeepMakesSenseEvaluatorTransformerV652:
    def __init__(self, model_path: Path = None, w2v_path: Path = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.w2v_path = w2v_path or (root_config.BASE_DIR / "models" / "recipes_word2vec.model")
        
        # Load Word2Vec
        self.w2v = Word2Vec.load(str(self.w2v_path))
        self.vocab_size = len(self.w2v.wv)
        
        self.full_model = MakesSenseTransformerV652(
            vocab_size=self.vocab_size + 2,
            embedding_dim=self.w2v.vector_size,
            d_model=128,
            n_heads=4,
            n_layers=2,
            d_ff=256,
            dropout=0.0
        )
        
        # Load weights if available
        if model_path and model_path.exists():
            self.full_model.load_state_dict(torch.load(str(model_path), map_location=self.device, weights_only=True))
            
        self.full_model.to(self.device)
        self.full_model.eval()
        
        # Expose trajectory transformer directly to search.py score functions
        self.model = self.full_model.trajectory_transformer
        
        # Intercepting writes from search.py
        self.embedding_cache = TokenEmbeddingCacheMS(self)

    def compute_sentence_embedding(self, sent: str) -> np.ndarray:
        tokens = clean_and_tokenize(sent)
        indices = []
        for word in tokens:
            if word in self.w2v.wv:
                indices.append(self.w2v.wv.key_to_index[word] + 2)
            else:
                indices.append(1)
        max_len = 30
        if len(indices) > max_len:
            indices = indices[:max_len]
        padding_length = max_len - len(indices)
        mask = [False] * len(indices) + [True] * padding_length
        indices = indices + [0] * padding_length
        
        x = torch.tensor(np.array([indices]), dtype=torch.long).to(self.device)
        mask_t = torch.tensor(np.array([mask]), dtype=torch.bool).to(self.device)
        with torch.no_grad():
            emb = self.full_model.sentence_encoder(x, mask_t).squeeze(0).cpu().numpy()
        return emb

    def precompute_embeddings(self, sentences: list):
        self.full_model.eval()
        batch_size = 2048
        max_len = 30
        for start_idx in range(0, len(sentences), batch_size):
            end_idx = min(start_idx + batch_size, len(sentences))
            batch_sents = sentences[start_idx:end_idx]
            
            xs = []
            masks = []
            for sent in batch_sents:
                tokens = clean_and_tokenize(sent)
                indices = []
                for word in tokens:
                    if word in self.w2v.wv:
                        indices.append(self.w2v.wv.key_to_index[word] + 2)
                    else:
                        indices.append(1)
                if len(indices) > max_len:
                    indices = indices[:max_len]
                padding_length = max_len - len(indices)
                mask = [False] * len(indices) + [True] * padding_length
                indices = indices + [0] * padding_length
                xs.append(indices)
                masks.append(mask)
                
            x = torch.tensor(np.array(xs), dtype=torch.long).to(self.device)
            mask_t = torch.tensor(np.array(masks), dtype=torch.bool).to(self.device)
            
            with torch.no_grad():
                embs = self.full_model.sentence_encoder(x, mask_t).cpu().numpy()
                
            for sent, emb in zip(batch_sents, embs):
                dict.__setitem__(self.embedding_cache, sent, emb)

    def get_embedding(self, sent: str) -> np.ndarray:
        return self.embedding_cache[sent]

    def score_trajectory(self, sentences: list) -> float:
        if not sentences:
            return 0.0
            
        max_len = 6
        embs = [self.get_embedding(s) for s in sentences]
        
        while len(embs) < max_len:
            embs.insert(0, np.zeros(256, dtype=np.float32))
            
        if len(embs) > max_len:
            embs = embs[-max_len:]
            
        x = torch.tensor(np.array([embs]), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            score = self.model(x).item()
        return score

    def score_candidates(self, history_sentences: list, candidate_sentences: list) -> list:
        if not candidate_sentences:
            return []
            
        max_len = 6
        hist_embs = [self.get_embedding(s) for s in history_sentences]
        
        batch_x = []
        for cand in candidate_sentences:
            cand_emb = self.get_embedding(cand)
            combined = hist_embs + [cand_emb]
            
            while len(combined) < max_len:
                combined.insert(0, np.zeros(256, dtype=np.float32))
                
            if len(combined) > max_len:
                combined = combined[-max_len:]
                
            batch_x.append(combined)
            
        x = torch.tensor(np.array(batch_x), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            outputs = self.model(x)
            scores = outputs.view(-1).cpu().numpy().tolist()
        return scores

