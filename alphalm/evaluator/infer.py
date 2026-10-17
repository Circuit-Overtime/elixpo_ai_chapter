import sys
import torch
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

import evaluator.eval_config as eval_config
from evaluator.model import MakesSenseMLP
from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector

class MakesSenseEvaluator:
    def __init__(self, model_path: Path = None, w2v_path: Path = None):
        """
        Wrapper class for the learned "Makes-Sense" evaluator.
        Loads the saved PyTorch MLP model and Word2Vec embeddings.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.window_size = eval_config.WINDOW_SIZE
        self.embedding_dim = eval_config.EMBEDDING_DIM
        
        self.model_path = model_path or eval_config.CHECKPOINT_PATH
        self.w2v_path = w2v_path or eval_config.W2V_MODEL_PATH
        
        # Load Word2Vec
        if not self.w2v_path.exists():
            raise FileNotFoundError(f"Word2Vec model not found at {self.w2v_path}. Run data_gen.py first.")
        self.w2v = Word2Vec.load(str(self.w2v_path))
        
        # Load Model
        input_dim = self.window_size * self.embedding_dim
        self.model = MakesSenseMLP(
            input_dim=input_dim,
            hidden_layers=eval_config.HIDDEN_LAYERS,
            dropout=0.0  # Turn off dropout for inference
        )
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model checkpoint not found at {self.model_path}. Train the model first.")
            
        self.model.load_state_dict(torch.load(str(self.model_path), map_location=self.device, weights_only=True))
        self.model.to(self.device)
        self.model.eval()
        
        # Cache to speed up tokenization and embedding lookup during search
        self.embedding_cache = {}

    def get_embedding(self, sent: str) -> np.ndarray:
        """Helper to get and cache a sentence's mean Word2Vec embedding."""
        if sent not in self.embedding_cache:
            tokens = clean_and_tokenize(sent)
            mean_vec = get_mean_vector(self.w2v, tokens)
            self.embedding_cache[sent] = mean_vec
        return self.embedding_cache[sent]

    def score_trajectory(self, sentences: list) -> float:
        """
        Scores a list of sentences based on their coherence.
        Returns a float probability in [0, 1] indicating whether the trajectory makes sense.
        """
        if not sentences:
            return 0.0
            
        # Handle short sequences by prepending the first sentence
        if len(sentences) < self.window_size:
            padded = [sentences[0]] * (self.window_size - len(sentences)) + list(sentences)
        else:
            padded = list(sentences[-self.window_size:])
            
        # Compute mean Word2Vec vectors for each sentence in the window
        sent_vectors = [self.get_embedding(sent) for sent in padded]
            
        # Concatenate to a single feature vector
        traj_vector = np.concatenate(sent_vectors)
        
        # Convert to PyTorch tensor
        x = torch.tensor(traj_vector, dtype=torch.float32).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            score = self.model(x).item()
            
        return score

    def score_candidates(self, history_sentences: list, candidate_sentences: list) -> list:
        """
        Scores a batch of candidate continuations given the history sentences.
        Returns a list of float probabilities.
        """
        if not candidate_sentences:
            return []
            
        # Precompute/fetch history sentence vectors
        hist_vectors = [self.get_embedding(s) for s in history_sentences]
        
        batch_traj_vectors = []
        for cand_sent in candidate_sentences:
            cand_vec = self.get_embedding(cand_sent)
            combined_vectors = hist_vectors + [cand_vec]
            
            # Pad or slice window
            if len(combined_vectors) < self.window_size:
                # Pad by prepending the first sentence vector
                first_vec = hist_vectors[0] if hist_vectors else cand_vec
                padded = [first_vec] * (self.window_size - len(combined_vectors)) + combined_vectors
            else:
                padded = combined_vectors[-self.window_size:]
                
            traj_vector = np.concatenate(padded)
            batch_traj_vectors.append(traj_vector)
            
        # Convert to PyTorch tensor and run batch inference
        x = torch.tensor(np.array(batch_traj_vectors), dtype=torch.float32).to(self.device)
        with torch.no_grad():
            outputs = self.model(x)
            scores = outputs.view(-1).cpu().numpy().tolist()
            
        return scores

