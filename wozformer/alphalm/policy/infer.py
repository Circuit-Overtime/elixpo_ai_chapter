import sys
import torch
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to sys.path to allow imports from root folder
POLICY_DIR = Path(__file__).resolve().parent
sys.path.append(str(POLICY_DIR.parent))

import policy.policy_config as policy_config
from policy.model import AlphaLMPolicyMLP
from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector

class AlphaLMPolicyHead:
    def __init__(self, model_path: Path = None, w2v_path: Path = None, hidden_layers: list = None):
        """
        Wrapper class for the learned Policy Head.
        Loads the saved PyTorch MLP model and uses evaluator's Word2Vec model.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.window_size = policy_config.WINDOW_SIZE
        self.embedding_dim = policy_config.EMBEDDING_DIM
        self.use_scalar = policy_config.USE_SCALAR_FEATURES
        self.hidden_layers = hidden_layers or policy_config.HIDDEN_LAYERS
        
        self.model_path = model_path or policy_config.CHECKPOINT_PATH
        self.w2v_path = w2v_path or policy_config.W2V_MODEL_PATH
        
        # Load Word2Vec
        if not self.w2v_path.exists():
            raise FileNotFoundError(f"Word2Vec model not found at {self.w2v_path}. Run data_gen.py first.")
        self.w2v = Word2Vec.load(str(self.w2v_path))
        self.embedding_dim = self.w2v.vector_size
        
        # Calculate input dimension
        input_dim = self.window_size * self.embedding_dim
        if self.use_scalar:
            input_dim += policy_config.NUM_SCALAR_FEATURES
            
        self.model = AlphaLMPolicyMLP(
            input_dim=input_dim,
            hidden_layers=self.hidden_layers,
            dropout=0.0  # Turn off dropout for inference
        )

        
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model checkpoint not found at {self.model_path}. Train the model first.")
            
        self.model.load_state_dict(torch.load(str(self.model_path), map_location=self.device, weights_only=True))
        self.model.to(self.device)
        self.model.eval()
        
        # Cache to speed up tokenization and embedding lookup
        self.embedding_cache = {}

    def get_embedding(self, sent: str) -> np.ndarray:
        """Helper to get and cache a sentence's mean Word2Vec embedding."""
        if sent not in self.embedding_cache:
            tokens = clean_and_tokenize(sent)
            mean_vec = get_mean_vector(self.w2v, tokens)
            self.embedding_cache[sent] = mean_vec
        return self.embedding_cache[sent]

    def score_candidates(
        self,
        history_sentences: list,
        candidate_sentences: list,
        scalar_features_list: list = None
    ) -> list:
        """
        Scores a batch of candidate continuations given history context.
        Args:
            history_sentences: List of sentences representing the current path context.
            candidate_sentences: List of string candidates.
            scalar_features_list: List of dicts or lists containing the 4 scalar scores per candidate,
                                  required if USE_SCALAR_FEATURES is True.
        Returns:
            A list of float probabilities (policy scores).
        """
        if not candidate_sentences:
            return []
            
        # Get history sentence embeddings
        hist_vectors = [self.get_embedding(s) for s in history_sentences]
        
        batch_vectors = []
        for i, cand_sent in enumerate(candidate_sentences):
            cand_vec = self.get_embedding(cand_sent)
            combined_vectors = hist_vectors + [cand_vec]
            
            # Pad or slice window to exactly window_size
            if len(combined_vectors) < self.window_size:
                first_vec = hist_vectors[0] if hist_vectors else cand_vec
                padded = [first_vec] * (self.window_size - len(combined_vectors)) + combined_vectors
            else:
                padded = combined_vectors[-self.window_size:]
                
            traj_vector = np.concatenate(padded)
            
            if self.use_scalar:
                if scalar_features_list is None or len(scalar_features_list) <= i:
                    raise ValueError("scalar_features_list must be provided when USE_SCALAR_FEATURES is True.")
                
                # Extract scores (can be dict or list of 4 floats)
                sf = scalar_features_list[i]
                if isinstance(sf, dict):
                    scores = np.array([
                        sf.get("boundary_score", 0.0),
                        sf.get("local_coherence", 0.0),
                        sf.get("global_coherence", 0.0),
                        sf.get("makes_sense_score", 0.0)
                    ], dtype=np.float32)
                else:
                    scores = np.array(sf, dtype=np.float32)
                traj_vector = np.concatenate([traj_vector, scores])
                
            batch_vectors.append(traj_vector)
            
        # Run batch model inference
        x = torch.tensor(np.array(batch_vectors), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            outputs = self.model(x)
            scores = outputs.view(-1).cpu().numpy().tolist()
            
        return scores


from policy.model import AlphaLMPolicyMLPV652

class TokenEmbeddingCachePolicy(dict):
    def __init__(self, policy_head):
        super().__init__()
        self.policy_head = policy_head
        
    def __setitem__(self, key, value):
        if key in self:
            return
        super().__setitem__(key, self.policy_head.compute_sentence_embedding(key))


class AlphaLMPolicyHeadV652:
    def __init__(self, model_path: Path = None, w2v_path: Path = None, hidden_layers: list = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.window_size = policy_config.WINDOW_SIZE
        self.use_scalar = policy_config.USE_SCALAR_FEATURES
        self.hidden_layers = hidden_layers or [512, 256, 64]
        
        self.model_path = model_path or (POLICY_DIR.parent / "models" / "policy_recipes_v652.pt")
        self.w2v_path = w2v_path or (POLICY_DIR.parent / "models" / "recipes_word2vec.model")
        
        self.w2v = Word2Vec.load(str(self.w2v_path))
        self.vocab_size = len(self.w2v.wv)
        
        self.full_model = AlphaLMPolicyMLPV652(
            vocab_size=self.vocab_size + 2,
            embedding_dim=self.w2v.vector_size,
            d_model=128,
            n_heads=4,
            n_layers=2,
            d_ff=256,
            dropout=0.0,
            window_size=self.window_size,
            hidden_layers=self.hidden_layers
        )
        
        if self.model_path.exists():
            self.full_model.load_state_dict(torch.load(str(self.model_path), map_location=self.device, weights_only=True))
            
        self.full_model.to(self.device)
        self.full_model.eval()
        
        self.model = self.full_model.mlp
        
        self.embedding_cache = TokenEmbeddingCachePolicy(self)

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

    def score_candidates(
        self,
        history_sentences: list,
        candidate_sentences: list,
        scalar_features_list: list = None
    ) -> list:
        if not candidate_sentences:
            return []
            
        hist_vectors = [self.get_embedding(s) for s in history_sentences]
        
        batch_vectors = []
        for i, cand_sent in enumerate(candidate_sentences):
            cand_vec = self.get_embedding(cand_sent)
            combined_vectors = hist_vectors + [cand_vec]
            
            if len(combined_vectors) < self.window_size:
                first_vec = hist_vectors[0] if hist_vectors else cand_vec
                padded = [first_vec] * (self.window_size - len(combined_vectors)) + combined_vectors
            else:
                padded = combined_vectors[-self.window_size:]
                
            traj_vector = np.concatenate(padded)
            
            if self.use_scalar:
                if scalar_features_list is None or len(scalar_features_list) <= i:
                    raise ValueError("scalar_features_list must be provided when USE_SCALAR_FEATURES is True.")
                sf = scalar_features_list[i]
                if isinstance(sf, dict):
                    scores = np.array([
                        sf.get("boundary_score", 0.0),
                        sf.get("local_coherence", 0.0),
                        sf.get("global_coherence", 0.0),
                        sf.get("makes_sense_score", 0.0)
                    ], dtype=np.float32)
                else:
                    scores = np.array(sf, dtype=np.float32)
                traj_vector = np.concatenate([traj_vector, scores])
                
            batch_vectors.append(traj_vector)
            
        x = torch.tensor(np.array(batch_vectors), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            outputs = self.model(x)
            scores = outputs.view(-1).cpu().numpy().tolist()
            
        return scores

