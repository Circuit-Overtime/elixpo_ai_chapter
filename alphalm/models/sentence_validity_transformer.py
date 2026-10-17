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
from scoring.validity_features import extract_validity_features
import config as root_config

class SentenceValidityTransformer(nn.Module):
    def __init__(self, vocab_size: int, word_dim: int = 100, hidden_dim: int = 128, num_heads: int = 4, num_layers: int = 2, dim_feedforward: int = 256, dropout: float = 0.2, pretrained_weights=None, freeze_emb: bool = False, num_scalar_features: int = 7, max_len: int = 30):
        """
        AlphaLM Sentence Validity Transformer.
        Maps word indices to embeddings, projects to hidden_dim, adds learned positional
        embeddings, passes through a Transformer Encoder stack, applies global max pooling,
        maps through an MLP, late-concatenates 7 scalar features, and classifies validity score in [0, 1].
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
        
        # Projection layer if embedding dimension doesn't match transformer hidden dimension
        if word_dim != hidden_dim:
            self.proj = nn.Linear(word_dim, hidden_dim)
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
        
        self.transformer_mlp = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.LayerNorm(32),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        # Late concatenation: transformer_mlp output (32) + scalar features (7) = 39
        self.final_linear = nn.Linear(32 + num_scalar_features, 1)
        self.sigmoid = nn.Sigmoid()
        
        # Initialize positional embeddings
        nn.init.normal_(self.pos_emb, std=0.02)

    def forward(self, x: torch.Tensor, scalar_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Word indices sequence tensor of shape [batch_size, seq_len]
            scalar_features: Sentence statistics tensor of shape [batch_size, 7]
        Returns:
            Validity probability in [0, 1], shape [batch_size, 1]
        """
        # Embed indices
        embedded = self.embedding(x) # shape: [batch_size, seq_len, word_dim]
        embedded = self.emb_dropout(embedded)
        
        # Project embeddings to transformer hidden dimension
        h = self.proj(embedded) # shape: [batch_size, seq_len, hidden_dim]
        
        # Add positional embedding
        h = h + self.pos_emb[:, :h.size(1), :]
        
        # Pass through Transformer encoder
        out = self.transformer(h) # shape: [batch_size, seq_len, hidden_dim]
        
        # Global Max Pooling over sequence/time dimension
        sent_emb, _ = torch.max(out, dim=1) # shape: [batch_size, hidden_dim]
        
        # Process through transformer MLP
        trans_feats = self.transformer_mlp(sent_emb) # shape: [batch_size, 32]
        
        # Concatenate features
        combined = torch.cat((trans_feats, scalar_features), dim=1) # shape: [batch_size, 32 + 7]
        
        # Predict validity
        out = self.sigmoid(self.final_linear(combined))
        return out


class SentenceValidityEvaluatorTransformer:
    def __init__(self, model_path: Path = None, w2v_path: Path = None, corpus_path: Path = None):
        """
        Wrapper class for Sentence Validity Transformer.
        Exposes methods to score single sentences or batches of candidate sentences.
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_path = model_path or getattr(root_config, "SENTENCE_VALIDITY_TRANSFORMER_PATH", root_config.BASE_DIR / "models" / "validity_tinystories_transformer.pt")
        self.w2v_path = w2v_path or (root_config.BASE_DIR / "evaluator" / "evaluator_w2v.model")
        
        # Load Word2Vec for vocabulary mapping
        self.w2v = Word2Vec.load(str(self.w2v_path))
        self.vocab_size = len(self.w2v.wv)
        
        # Initialize model
        self.model = SentenceValidityTransformer(
            vocab_size=self.vocab_size + 2,
            word_dim=self.w2v.vector_size,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
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
        
        if corpus_path is not None:
            corpus_text = load_corpus(corpus_path)
            stories = corpus_text.split("<|endoftext|>")
            corpus_sents = []
            for story in stories:
                if story.strip():
                    corpus_sents.extend(split_into_sentences(story))
        else:
            sales_text = load_corpus(root_config.BASE_DIR / "sales_dataset.txt")
            newton_text = load_corpus(root_config.BASE_DIR / "newton_dataset.txt")
            corpus_sents = split_into_sentences(sales_text) + split_into_sentences(newton_text)
        
        self.corpus_bigrams = set()
        for sent in corpus_sents:
            tokens = clean_and_tokenize(sent)
            for i in range(len(tokens) - 1):
                self.corpus_bigrams.add((tokens[i], tokens[i+1]))

    def _text_to_indices_and_features(self, sentence: str, max_len: int = 30):
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
            
        # Extract features dictionary
        feats_dict = extract_validity_features(sentence, self.corpus_bigrams)
        # Vectorized scalar features: [length_char, num_tokens, punctuation_count, unique_token_ratio, repeated_bigram_count, seen_bigram_fraction, is_perfect_bigram]
        scalar_vec = [
            feats_dict["length_char"],
            feats_dict["num_tokens"],
            feats_dict["punctuation_count"],
            feats_dict["unique_token_ratio"],
            feats_dict["repeated_bigram_count"],
            feats_dict["seen_bigram_fraction"],
            feats_dict["is_perfect_bigram"]
        ]
        
        return np.array(indices, dtype=np.int64), np.array(scalar_vec, dtype=np.float32)

    def score_sentence(self, sentence: str) -> float:
        """Scores the syntactic validity of a single sentence."""
        if sentence not in self.validity_cache:
            indices, scalar_vec = self._text_to_indices_and_features(sentence)
            x = torch.tensor(np.array([indices]), dtype=torch.long).to(self.device)
            f_tensor = torch.tensor(np.array([scalar_vec]), dtype=torch.float32).to(self.device)
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
                indices, scalar_vec = self._text_to_indices_and_features(sent)
                batch_x.append(indices)
                batch_f.append(scalar_vec)
                
            x = torch.tensor(np.array(batch_x), dtype=torch.long).to(self.device)
            f_tensor = torch.tensor(np.array(batch_f), dtype=torch.float32).to(self.device)
            with torch.no_grad():
                outputs = self.model(x, f_tensor)
                pred_scores = outputs.view(-1).cpu().numpy().tolist()
                
            for idx, sent, score in zip(uncached_indices, uncached_sentences, pred_scores):
                self.validity_cache[sent] = score
                scores[idx] = score
                
        return scores
