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
import config as root_config

class SentenceValidityBiGRU(nn.Module):
    def __init__(self, vocab_size: int, word_dim: int = 100, gru_hidden: int = 64, dropout: float = 0.2, pretrained_weights=None, freeze_emb: bool = False):
        """
        Sentence Validity Head.
        Processes a sequence of word indices, maps them to embeddings,
        passes through a Bidirectional GRU, and uses Global Max Pooling.
        Concatenates the seen-bigram fraction and its binary indicator before the final layer.
        """
        super().__init__()
        
        # Trainable embedding layer initialized with pretrained Word2Vec vectors if provided
        if pretrained_weights is not None:
            self.embedding = nn.Embedding.from_pretrained(
                torch.tensor(pretrained_weights, dtype=torch.float32),
                freeze=freeze_emb,
                padding_idx=0
            )
        else:
            self.embedding = nn.Embedding(vocab_size, word_dim, padding_idx=0)
            
        self.emb_dropout = nn.Dropout(dropout)
            
        self.gru = nn.GRU(
            input_size=word_dim,
            hidden_size=gru_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True
        )
        
        self.gru_mlp = nn.Sequential(
            nn.Linear(gru_hidden * 2, 32),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        # Late concatenation: gru_mlp output (32) + fraction (1) + is_perfect_bigram (1) = 34
        self.final_linear = nn.Linear(32 + 2, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor, fraction: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Word indices sequence tensor of shape [batch_size, seq_len]
            fraction: Seen-bigram fraction tensor of shape [batch_size, 1]
        Returns:
            Validity probability in [0, 1], shape [batch_size, 1]
        """
        # Embed indices
        embedded = self.embedding(x) # shape: [batch_size, seq_len, word_dim]
        embedded = self.emb_dropout(embedded)
        
        # GRU outputs: [batch_size, seq_len, gru_hidden * 2]
        gru_out, _ = self.gru(embedded)
        
        # Global Max Pooling over time/sequence dimension (dim=1) to prevent zero-padding decay
        sent_emb, _ = torch.max(gru_out, dim=1) # shape: [batch_size, gru_hidden * 2]
        
        # Process through GRU MLP
        gru_feats = self.gru_mlp(sent_emb)
        
        # Compute binary indicator: 1.0 if fraction >= 0.999 else 0.0
        is_perfect = (fraction >= 0.999).float()
        
        # Concatenate features
        combined = torch.cat((gru_feats, fraction, is_perfect), dim=1) # shape: [batch_size, 32 + 2]
        
        # Predict validity
        out = self.sigmoid(self.final_linear(combined))
        return out


class SentenceValidityEvaluator:
    def __init__(self, model_path: Path = None, w2v_path: Path = None):
        """
        Wrapper class for Sentence Validity Head.
        Exposes methods to score single sentences or batches of candidate sentences.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_path = model_path or root_config.SENTENCE_VALIDITY_PATH
        self.w2v_path = w2v_path or (root_config.BASE_DIR / "evaluator" / "evaluator_w2v.model")
        
        # Load Word2Vec for vocabulary mapping
        self.w2v = Word2Vec.load(str(self.w2v_path))
        self.vocab_size = len(self.w2v.wv)
        
        # Initialize model
        self.model = SentenceValidityBiGRU(
            vocab_size=self.vocab_size + 2,
            word_dim=self.w2v.vector_size,
            gru_hidden=64,
            dropout=0.0
        )
        
        if self.model_path.exists():
            self.model.load_state_dict(torch.load(str(self.model_path), map_location=self.device, weights_only=True))
        else:
            print(f"Warning: sentence validity checkpoint {self.model_path} not found. Using untrained weights.")
            
        self.model.to(self.device)
        self.model.eval()
        
        # Cache to speed up repeat evaluation
        self.validity_cache = {}
        
        # Load corpus to extract bigrams
        from loader import load_corpus
        from tokenizer import split_into_sentences
        sales_text = load_corpus(root_config.BASE_DIR / "sales_dataset.txt")
        newton_text = load_corpus(root_config.BASE_DIR / "newton_dataset.txt")
        corpus_sents = split_into_sentences(sales_text) + split_into_sentences(newton_text)
        
        self.corpus_bigrams = set()
        for sent in corpus_sents:
            tokens = clean_and_tokenize(sent)
            for i in range(len(tokens) - 1):
                self.corpus_bigrams.add((tokens[i], tokens[i+1]))

    def _text_to_indices_and_fraction(self, sentence: str, max_len: int = 30):
        tokens = clean_and_tokenize(sentence)
        indices = []
        for word in tokens:
            if word in self.w2v.wv:
                indices.append(self.w2v.wv.key_to_index[word] + 2)
            else:
                indices.append(1) # OOV index
                
        while len(indices) < max_len:
            indices.append(0) # padding index
            
        if len(indices) > max_len:
            indices = indices[:max_len]
            
        # Compute bigram fraction
        if len(tokens) < 2:
            fraction = 1.0
        else:
            unseen = 0
            for i in range(len(tokens) - 1):
                bigram = (tokens[i], tokens[i+1])
                if bigram not in self.corpus_bigrams:
                    unseen += 1
            fraction = 1.0 - (unseen / (len(tokens) - 1))
            
        return np.array(indices, dtype=np.int64), float(fraction)

    def score_sentence(self, sentence: str) -> float:
        """Scores the syntactic validity of a single sentence."""
        if sentence not in self.validity_cache:
            indices, fraction = self._text_to_indices_and_fraction(sentence)
            x = torch.tensor(np.array([indices]), dtype=torch.long).to(self.device)
            f_tensor = torch.tensor(np.array([[fraction]]), dtype=torch.float32).to(self.device)
            with torch.no_grad():
                self.validity_cache[sentence] = self.model(x, f_tensor).item()
        return self.validity_cache[sentence]

    def score_sentences(self, sentences: list) -> list:
        """Scores the syntactic validity of a batch of sentences."""
        if not sentences:
            return []
            
        batch_x = []
        batch_f = []
        uncached_indices = []
        uncached_sentences = []
        
        scores = [0.0] * len(sentences)
        
        for idx, sent in enumerate(sentences):
            if sent in self.validity_cache:
                scores[idx] = self.validity_cache[sent]
            else:
                uncached_indices.append(idx)
                uncached_sentences.append(sent)
                
        if uncached_sentences:
            for sent in uncached_sentences:
                indices, fraction = self._text_to_indices_and_fraction(sent)
                batch_x.append(indices)
                batch_f.append([fraction])
                
            x = torch.tensor(np.array(batch_x), dtype=torch.long).to(self.device)
            f_tensor = torch.tensor(np.array(batch_f), dtype=torch.float32).to(self.device)
            with torch.no_grad():
                outputs = self.model(x, f_tensor)
                pred_scores = outputs.view(-1).cpu().numpy().tolist()
                
            for idx, sent, score in zip(uncached_indices, uncached_sentences, pred_scores):
                self.validity_cache[sent] = score
                scores[idx] = score
                
        return scores
