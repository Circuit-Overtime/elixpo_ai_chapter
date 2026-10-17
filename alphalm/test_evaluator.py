import sys
import unittest
import torch
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to sys.path to allow imports from root folder
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

import config as root_config
import evaluator.eval_config as eval_config
from evaluator.dataset import TrajectoryDataset
from evaluator.model import MakesSenseMLP
from evaluator.infer import MakesSenseEvaluator
from search import AlphaLMSearcher, SearchPath
from tokenizer import clean_and_tokenize

class TestMakesSenseEvaluator(unittest.TestCase):
    def test_eval_config(self):
        """Test evaluator configurations exist and have expected types."""
        self.assertEqual(eval_config.WINDOW_SIZE, 4)
        self.assertEqual(eval_config.EMBEDDING_DIM, 100)
        self.assertTrue(isinstance(eval_config.HIDDEN_LAYERS, list))
        
    def test_model_forward(self):
        """Test forward pass of MakesSenseMLP."""
        input_dim = eval_config.WINDOW_SIZE * eval_config.EMBEDDING_DIM
        model = MakesSenseMLP(
            input_dim=input_dim,
            hidden_layers=[32, 16],
            dropout=0.1
        )
        # Random input batch of size 5
        dummy_input = torch.randn(5, input_dim)
        output = model(dummy_input)
        self.assertEqual(output.shape, (5, 1))
        # Outputs must be probabilities in [0, 1]
        self.assertTrue(torch.all(output >= 0.0))
        self.assertTrue(torch.all(output <= 1.0))
        
    def test_dataset(self):
        """Test that TrajectoryDataset loads data and returns correct shapes."""
        if not eval_config.TRAIN_DATA_PATH.exists() or not eval_config.W2V_MODEL_PATH.exists():
            self.skipTest("Skipping dataset test: generated data or Word2Vec model not found.")
            
        dataset = TrajectoryDataset(eval_config.TRAIN_DATA_PATH, eval_config.W2V_MODEL_PATH)
        self.assertTrue(len(dataset) > 0)
        
        sample_x, sample_y = dataset[0]
        expected_dim = eval_config.WINDOW_SIZE * eval_config.EMBEDDING_DIM
        self.assertEqual(sample_x.shape, (expected_dim,))
        self.assertEqual(sample_y.shape, (1,))
        
    def test_evaluator_inference(self):
        """Test that MakesSenseEvaluator loads and scores a list of sentences."""
        if not eval_config.CHECKPOINT_PATH.exists() or not eval_config.W2V_MODEL_PATH.exists():
            self.skipTest("Skipping evaluator inference test: checkpoint/w2v not found.")
            
        evaluator = MakesSenseEvaluator(
            model_path=eval_config.CHECKPOINT_PATH,
            w2v_path=eval_config.W2V_MODEL_PATH
        )
        
        # Test sentence lists of different lengths
        sents_short = [
            "We have a great promotion on our new software today.",
            "Our sales team will contact you shortly."
        ]
        sents_exact = [
            "We have a great promotion on our new software today.",
            "Our sales team will contact you shortly.",
            "Please check out the pricing page for details.",
            "We offer a 30-day money-back guarantee."
        ]
        sents_long = sents_exact + ["Our support team is available 24/7."]
        
        score_short = evaluator.score_trajectory(sents_short)
        score_exact = evaluator.score_trajectory(sents_exact)
        score_long = evaluator.score_trajectory(sents_long)
        
        for name, score in [("short", score_short), ("exact", score_exact), ("long", score_long)]:
            self.assertTrue(0.0 <= score <= 1.0, f"Score for {name} ({score}) is not in [0, 1]")
            
    def test_search_integration(self):
        """Test AlphaLMSearcher with MakesSenseEvaluator integration."""
        if not eval_config.CHECKPOINT_PATH.exists() or not eval_config.W2V_MODEL_PATH.exists():
            self.skipTest("Skipping search integration test: checkpoint/w2v not found.")
            
        evaluator = MakesSenseEvaluator(
            model_path=eval_config.CHECKPOINT_PATH,
            w2v_path=eval_config.W2V_MODEL_PATH
        )
        
        corpus = [
            "This is the first sentence.",
            "This is the second sentence.",
            "This is the third sentence.",
            "This is the fourth sentence.",
            "This is the fifth sentence."
        ]
        
        # Train a mock/small Word2Vec on the corpus
        tokenized = [clean_and_tokenize(s) for s in corpus]
        w2v = Word2Vec(tokenized, vector_size=eval_config.EMBEDDING_DIM, min_count=1, seed=42)
        
        searcher = AlphaLMSearcher(corpus, w2v, makes_sense_evaluator=evaluator)
        
        # Test search with makes_sense weight > 0
        weights = {
            "boundary": 1.0,
            "local": 0.5,
            "global": 0.5,
            "completion": 0.0,
            "makes_sense": 1.0
        }
        
        best_path, step_logs = searcher.search(
            seed_idx=0,
            num_sentences=4,
            beam_width=2,
            weights=weights
        )
        
        self.assertEqual(len(best_path.sentence_indices), 4)
        self.assertEqual(len(best_path.makes_sense_scores), 3)  # step 1, 2, 3
        for score in best_path.makes_sense_scores:
            self.assertTrue(0.0 <= score <= 1.0)

if __name__ == "__main__":
    unittest.main()
