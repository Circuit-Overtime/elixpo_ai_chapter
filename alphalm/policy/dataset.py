import sys
import json
import torch
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset
from gensim.models import Word2Vec

# Add parent directory to sys.path to allow imports from root folder
POLICY_DIR = Path(__file__).resolve().parent
sys.path.append(str(POLICY_DIR.parent))

from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector
import policy.policy_config as policy_config

class PolicyDataset(Dataset):
    def __init__(self, json_path: Path, w2v_model_path: Path, use_scalar_features: bool = None):
        """
        PyTorch Dataset for training the policy head.
        Loads candidate transition records, represents them as concatenated mean Word2Vec vectors,
        and optionally appends scalar score features.
        """
        self.samples = []
        self.labels = []
        
        if use_scalar_features is None:
            use_scalar_features = policy_config.USE_SCALAR_FEATURES
            
        self.use_scalar = use_scalar_features
        
        # Load Word2Vec model
        if not w2v_model_path.exists():
            raise FileNotFoundError(f"Word2Vec model not found at {w2v_model_path}. Train the evaluator first.")
        w2v = Word2Vec.load(str(w2v_model_path))
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        for item in data:
            context = item["context"]
            candidate = item["candidate"]
            label = float(item["label"])
            
            # Form standard trajectory of WINDOW_SIZE sentences
            combined_sentences = context + [candidate]
            if len(combined_sentences) < policy_config.WINDOW_SIZE:
                first_sent = context[0] if context else candidate
                padded = [first_sent] * (policy_config.WINDOW_SIZE - len(combined_sentences)) + combined_sentences
            else:
                padded = combined_sentences[-policy_config.WINDOW_SIZE:]
                
            # Vectorize each sentence
            sent_vectors = []
            for sent in padded:
                tokens = clean_and_tokenize(sent)
                mean_vec = get_mean_vector(w2v, tokens)
                sent_vectors.append(mean_vec)
                
            # Concatenate Word2Vec features to shape: (WINDOW_SIZE * EMBEDDING_DIM,)
            feature_vector = np.concatenate(sent_vectors)
            
            if self.use_scalar:
                # Retrieve scalar heuristic scores
                scalars = np.array([
                    item.get("boundary_score", 0.0),
                    item.get("local_coherence", 0.0),
                    item.get("global_coherence", 0.0),
                    item.get("makes_sense_score", 0.0)
                ], dtype=np.float32)
                # Concatenate scalars with the embeddings
                feature_vector = np.concatenate([feature_vector, scalars])
                
            self.samples.append(feature_vector)
            self.labels.append(label)
            
        self.samples = torch.tensor(np.array(self.samples), dtype=torch.float32)
        self.labels = torch.tensor(np.array(self.labels), dtype=torch.float32).unsqueeze(1)
        
    def __len__(self):
        return len(self.samples)
        
    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]
