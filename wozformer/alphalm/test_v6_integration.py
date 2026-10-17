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
from models.sentence_validity_transformer import SentenceValidityTransformer, SentenceValidityEvaluatorTransformer
from search import AlphaLMSearcher
from tokenizer import clean_and_tokenize

class TestV6Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = ROOT_DIR / "v6_integration_test_temp"
        cls.test_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Create mock corpus
        cls.corpus = [
            "the dog barked at the mailman.",
            "the mailman ran away in fear.",
            "he dropped all the letters on the street.",
            "a friendly bird picked them up later."
        ]
        tokenized = [clean_and_tokenize(s) for s in cls.corpus]
        cls.w2v_path = cls.test_dir / "test_w2v.model"
        cls.w2v = Word2Vec(tokenized, vector_size=100, min_count=1, seed=42)
        cls.w2v.save(str(cls.w2v_path))
        
        # 2. Save mock makes sense transformer checkpoint
        cls.ms_model = MakesSenseTransformer(
            sentence_dim=100,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
            dropout=0.0
        )
        cls.ms_checkpoint_path = cls.test_dir / "test_makes_sense_transformer.pt"
        torch.save(cls.ms_model.state_dict(), str(cls.ms_checkpoint_path))
        
        # 3. Save mock validity transformer checkpoint
        cls.vocab_size = len(cls.w2v.wv) + 2
        pretrained_weights = np.zeros((cls.vocab_size, 100), dtype=np.float32)
        cls.val_model = SentenceValidityTransformer(
            vocab_size=cls.vocab_size,
            word_dim=100,
            hidden_dim=128,
            num_heads=4,
            num_layers=2,
            dim_feedforward=256,
            dropout=0.0,
            pretrained_weights=pretrained_weights,
            num_scalar_features=7
        )
        cls.val_checkpoint_path = cls.test_dir / "test_sentence_validity_transformer.pt"
        torch.save(cls.val_model.state_dict(), str(cls.val_checkpoint_path))

    @classmethod
    def tearDownClass(cls):
        # Clean up files
        if cls.w2v_path.exists():
            cls.w2v_path.unlink()
        if cls.ms_checkpoint_path.exists():
            cls.ms_checkpoint_path.unlink()
        if cls.val_checkpoint_path.exists():
            cls.val_checkpoint_path.unlink()
        for f in cls.test_dir.glob("test_w2v.model*"):
            f.unlink()
        if cls.test_dir.exists():
            cls.test_dir.rmdir()

    def test_search_and_stitch_v6(self):
        """Verify AlphaLM v6 search runs with both Transformer evaluators and stitches successfully."""
        ms_evaluator = DeepMakesSenseEvaluatorTransformer(
            model_path=self.ms_checkpoint_path,
            w2v_path=self.w2v_path
        )
        val_evaluator = SentenceValidityEvaluatorTransformer(
            model_path=self.val_checkpoint_path,
            w2v_path=self.w2v_path
        )
        
        searcher = AlphaLMSearcher(
            corpus_sentences=self.corpus,
            w2v_model=self.w2v,
            makes_sense_evaluator=ms_evaluator,
            policy_head=None,
            sentence_validity_evaluator=val_evaluator
        )
        
        weights = {
            "boundary": 1.0,
            "local": 0.5,
            "global": 0.5,
            "completion": 0.0,
            "makes_sense": 1.0,
            "policy": 0.0,
            "validity": 1.0
        }
        
        # Test legacy mode
        path_legacy, logs_legacy = searcher.search(
            seed_idx=0,
            num_sentences=3,
            beam_width=2,
            weights=weights,
            stitch_mode="legacy"
        )
        self.assertEqual(len(path_legacy.sentence_indices), 3)
        self.assertTrue(len(path_legacy.generated_text) > 0)
        
        # Test sentence preserving mode
        path_pres, logs_pres = searcher.search(
            seed_idx=0,
            num_sentences=3,
            beam_width=2,
            weights=weights,
            stitch_mode="sentence_preserving"
        )
        self.assertEqual(len(path_pres.sentence_indices), 3)
        self.assertTrue(path_pres.generated_text.endswith("."))
        
        # Test smart mode (which exercises validity evaluator)
        path_smart, logs_smart = searcher.search(
            seed_idx=0,
            num_sentences=3,
            beam_width=2,
            weights=weights,
            stitch_mode="smart"
        )
        self.assertEqual(len(path_smart.sentence_indices), 3)
        self.assertTrue(len(path_smart.generated_text) > 0)

if __name__ == "__main__":
    unittest.main()
