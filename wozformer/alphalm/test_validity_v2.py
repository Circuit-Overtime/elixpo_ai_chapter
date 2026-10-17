import sys
import unittest
import torch
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from models.sentence_validity_v2 import SentenceValidityBiGRUV2, SentenceValidityEvaluatorV2
from search import AlphaLMSearcher
from tokenizer import clean_and_tokenize

class TestSentenceValidityV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = ROOT_DIR / "validity_v2_test_temp"
        cls.test_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Create a mock corpus and train a tiny Word2Vec model
        cls.corpus = [
            "this helps to generate repeat business.",
            "our sales team will contact you shortly.",
            "please check out the pricing page.",
            "we offer a money-back guarantee."
        ]
        tokenized = [clean_and_tokenize(s) for s in cls.corpus]
        cls.w2v_path = cls.test_dir / "test_w2v.model"
        cls.w2v = Word2Vec(tokenized, vector_size=100, min_count=1, seed=42)
        cls.w2v.save(str(cls.w2v_path))
        
        # 2. Save a mock model checkpoint
        cls.vocab_size = len(cls.w2v.wv) + 2
        
        pretrained_weights = np.zeros((cls.vocab_size, 100), dtype=np.float32)
        cls.model = SentenceValidityBiGRUV2(
            vocab_size=cls.vocab_size,
            word_dim=100,
            gru_hidden=64,
            dropout=0.0,
            pretrained_weights=pretrained_weights,
            num_scalar_features=7
        )
        cls.checkpoint_path = cls.test_dir / "test_sentence_validity_v2.pt"
        torch.save(cls.model.state_dict(), str(cls.checkpoint_path))

    @classmethod
    def tearDownClass(cls):
        # Clean up temporary test files
        if cls.w2v_path.exists():
            cls.w2v_path.unlink()
        if cls.checkpoint_path.exists():
            cls.checkpoint_path.unlink()
        for f in cls.test_dir.glob("test_w2v.model*"):
            f.unlink()
        if cls.test_dir.exists():
            cls.test_dir.rmdir()

    def test_model_forward(self):
        """Test validity v2 model forward pass and output bounds."""
        dummy_x = torch.randint(0, self.vocab_size, (5, 30))
        dummy_f = torch.rand(5, 7) # 7 features
        output = self.model(dummy_x, dummy_f)
        self.assertEqual(output.shape, (5, 1))
        self.assertTrue(torch.all(output >= 0.0))
        self.assertTrue(torch.all(output <= 1.0))

    def test_evaluator_inference(self):
        """Test validity v2 evaluator wrapper initialization and scoring."""
        evaluator = SentenceValidityEvaluatorV2(
            model_path=self.checkpoint_path,
            w2v_path=self.w2v_path
        )
        
        # Score a single sentence
        score = evaluator.score_sentence("This is a valid sentence.")
        self.assertTrue(0.0 <= score <= 1.0)
        
        # Score multiple sentences in batch
        scores = evaluator.score_sentences([
            "First sentence is good.",
            "Second sentence is also good."
        ])
        self.assertEqual(len(scores), 2)
        for s in scores:
            self.assertTrue(0.0 <= s <= 1.0)

    def test_search_integration_with_validity(self):
        """Test beam search integration when sentence validity head v2 is active."""
        evaluator = SentenceValidityEvaluatorV2(
            model_path=self.checkpoint_path,
            w2v_path=self.w2v_path
        )
        
        searcher = AlphaLMSearcher(
            corpus_sentences=self.corpus,
            w2v_model=self.w2v,
            makes_sense_evaluator=None,
            policy_head=None,
            sentence_validity_evaluator=evaluator
        )
        
        weights = {
            "boundary": 1.0,
            "local": 0.5,
            "global": 0.5,
            "completion": 0.0,
            "makes_sense": 0.0,
            "policy": 0.0,
            "validity": 1.0
        }
        
        best_path, step_logs = searcher.search(
            seed_idx=0,
            num_sentences=3,
            beam_width=2,
            weights=weights
        )
        
        self.assertEqual(len(best_path.sentence_indices), 3)
        self.assertEqual(len(best_path.validity_scores), 2)
        for s in best_path.validity_scores:
            self.assertTrue(0.0 <= s <= 1.0)

if __name__ == "__main__":
    unittest.main()
