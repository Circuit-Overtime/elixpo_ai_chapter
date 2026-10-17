import sys
import unittest
import torch
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from models.makes_sense_transformer import MakesSenseTransformer, DeepMakesSenseEvaluatorTransformer
from search import AlphaLMSearcher
from tokenizer import clean_and_tokenize

class TestMakesSenseTransformer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = ROOT_DIR / "makes_sense_transformer_test_temp"
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
        cls.model = MakesSenseTransformer(
            sentence_dim=100,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
            dropout=0.0
        )
        cls.checkpoint_path = cls.test_dir / "test_makes_sense_transformer.pt"
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
        """Test Makes-Sense Transformer model forward pass and output bounds."""
        dummy_x = torch.randn(5, 6, 100) # batch=5, seq_len=6, dim=100
        output = self.model(dummy_x)
        self.assertEqual(output.shape, (5, 1))
        self.assertTrue(torch.all(output >= 0.0))
        self.assertTrue(torch.all(output <= 1.0))

    def test_evaluator_inference(self):
        """Test Makes-Sense Transformer evaluator wrapper initialization and scoring."""
        evaluator = DeepMakesSenseEvaluatorTransformer(
            model_path=self.checkpoint_path,
            w2v_path=self.w2v_path
        )
        
        # Score a single trajectory
        score = evaluator.score_trajectory(["this helps to generate repeat business.", "please check out the pricing page."])
        self.assertTrue(0.0 <= score <= 1.0)
        
        # Score multiple candidates in batch
        scores = evaluator.score_candidates(
            history_sentences=["this helps to generate repeat business."],
            candidate_sentences=["our sales team will contact you shortly.", "we offer a money-back guarantee."]
        )
        self.assertEqual(len(scores), 2)
        for s in scores:
            self.assertTrue(0.0 <= s <= 1.0)

    def test_search_integration_with_makes_sense(self):
        """Test beam search integration when Makes-Sense Transformer trajectory scorer is active."""
        evaluator = DeepMakesSenseEvaluatorTransformer(
            model_path=self.checkpoint_path,
            w2v_path=self.w2v_path
        )
        
        searcher = AlphaLMSearcher(
            corpus_sentences=self.corpus,
            w2v_model=self.w2v,
            makes_sense_evaluator=evaluator,
            policy_head=None,
            sentence_validity_evaluator=None
        )
        
        weights = {
            "boundary": 1.0,
            "local": 0.5,
            "global": 0.5,
            "completion": 0.0,
            "makes_sense": 1.0,
            "policy": 0.0,
            "validity": 0.0
        }
        
        best_path, step_logs = searcher.search(
            seed_idx=0,
            num_sentences=3,
            beam_width=2,
            weights=weights
        )
        
        self.assertEqual(len(best_path.sentence_indices), 3)
        self.assertEqual(len(best_path.makes_sense_scores), 2)
        for s in best_path.makes_sense_scores:
            self.assertTrue(0.0 <= s <= 1.0)

if __name__ == "__main__":
    unittest.main()
