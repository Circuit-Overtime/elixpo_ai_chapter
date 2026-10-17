import sys
import json
import torch
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset
from gensim.models import Word2Vec

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector
import evaluator.eval_config as eval_config

class TrajectoryDataset(Dataset):
    def __init__(self, json_path: Path, w2v_model_path: Path):
        """
        Loads the generated samples and maps sentences to mean Word2Vec vectors,
        concatenating them to form trajectory vectors of shape (K * vector_size,).
        """
        self.samples = []
        self.labels = []
        
        # Load Word2Vec model
        w2v = Word2Vec.load(str(w2v_model_path))
        vector_size = w2v.vector_size
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        for item in data:
            sentences = item["sentences"]
            label = float(item["label"])
            
            # Vectorize each sentence
            sent_vectors = []
            for sent in sentences:
                tokens = clean_and_tokenize(sent)
                mean_vec = get_mean_vector(w2v, tokens)
                sent_vectors.append(mean_vec)
                
            # Concatenate the vectors to form a K * vector_size array
            traj_vector = np.concatenate(sent_vectors)  # shape: (K * vector_size,)
            
            self.samples.append(traj_vector)
            self.labels.append(label)
            
        self.samples = torch.tensor(np.array(self.samples), dtype=torch.float32)
        self.labels = torch.tensor(np.array(self.labels), dtype=torch.float32).unsqueeze(1)  # shape: (N, 1)
        
    def __len__(self):
        return len(self.samples)
        
    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]
