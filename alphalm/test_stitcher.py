import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from rendering.stitcher import stitch_text_v552, strip_leading_overlap
from rendering.boundary_validator import is_safe_merge

# Mock validity evaluator class for tests
class MockValidityEvaluator:
    def __init__(self, scores: dict):
        self.scores = {k.strip().rstrip(".").lower(): v for k, v in scores.items()}
        
    def score_sentence(self, sentence: str) -> float:
        key = sentence.strip().rstrip(".").lower()
        # Direct exact match
        if key in self.scores:
            return self.scores[key]
        # Partial fallback (longest key first)
        sorted_keys = sorted(self.scores.keys(), key=len, reverse=True)
        for k in sorted_keys:
            if k in key:
                return self.scores[k]
        return 0.5

class TestStitcherAndValidator(unittest.TestCase):
    def setUp(self):
        # Sample sentences for tests
        self.s1_orig = "Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust."
        self.s2_orig = "Trust and credibility are crucial factors in any purchasing decision."
        self.s3_orig = "Decision-making authority objections: In some cases, prospects may claim that they lack the authority to make the final decision."
        
        self.s1_tok = ["showing", "genuine", "interest", "in", "your", "customers", "needs", "and", "aspirations", "will", "go", "a", "long", "way", "in", "building", "rapport", "and", "trust"]
        self.s2_tok = ["trust", "and", "credibility", "are", "crucial", "factors", "in", "any", "purchasing", "decision"]
        self.s3_tok = ["decision", "making", "authority", "objections", "in", "some", "cases", "prospects", "may", "claim", "that", "they", "lack", "the", "authority", "to", "make", "the", "final", "decision"]
        
        self.tokenized_sentences = [self.s1_tok, self.s2_tok, self.s3_tok]
        self.original_sentences = [self.s1_orig, self.s2_orig, self.s3_orig]
        self.match_scores = [1, 1] # exact overlap size 1 ("trust" and "decision")

    def test_strip_leading_overlap(self):
        """Tests that duplicate leading words are cleanly stripped from the string representation."""
        # Strip "trust" (1 word) from "Trust and credibility..."
        stripped = strip_leading_overlap("Trust and credibility are crucial.", 1)
        self.assertEqual(stripped, "And credibility are crucial.")
        
        # Strip "decision" (1 word) from "Decision-making authority objections..."
        stripped = strip_leading_overlap("Decision-making authority objections.", 1)
        self.assertEqual(stripped, "Making authority objections.")

    def test_legacy_stitch(self):
        """Legacy stitching collapses boundary overlap and removes sentence boundaries."""
        stitched = stitch_text_v552(
            self.tokenized_sentences,
            self.match_scores,
            self.original_sentences,
            stitch_mode="legacy"
        )
        # Verify overlap is collapsed and punctuation is missing at bounds
        self.assertIn("rapport and trust and credibility", stitched.lower())
        self.assertIn("purchasing decision making authority", stitched.lower())
        self.assertNotIn("rapport and trust. And credibility", stitched)

    def test_sentence_preserving_stitch(self):
        """Sentence preserving stitching preserves periods and original structures without word collapse."""
        stitched = stitch_text_v552(
            self.tokenized_sentences,
            self.match_scores,
            self.original_sentences,
            stitch_mode="sentence_preserving"
        )
        self.assertIn("rapport and trust. Trust and credibility", stitched)
        self.assertIn("purchasing decision. Decision-making authority", stitched)

    def test_smart_stitch_safe_merge(self):
        """Smart stitching merges overlap words but preserves sentence boundary punctuation when safe."""
        # Setup mock evaluator where merge is safe (score of merged is high)
        mock_eval = MockValidityEvaluator({
            "showing genuine interest in your customers": 0.8,
            "trust and credibility are crucial": 0.8,
            "showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. and credibility are crucial factors in any purchasing decision": 0.85,
            "decision-making authority": 0.8,
            "trust and credibility are crucial factors in any purchasing decision. making authority objections": 0.85
        })
        
        stitched = stitch_text_v552(
            self.tokenized_sentences,
            self.match_scores,
            self.original_sentences,
            stitch_mode="smart",
            validity_evaluator=mock_eval
        )
        
        # Should merge: A + stripped B (e.g. "...trust. And credibility...")
        self.assertIn("rapport and trust. And credibility", stitched)
        self.assertIn("purchasing decision. Making authority", stitched)
        # Should not duplicate the matched words
        self.assertNotIn("trust. Trust and", stitched)
        self.assertNotIn("decision. Decision-making", stitched)

    def test_smart_stitch_unsafe_merge(self):
        """Smart stitching falls back to sentence preserving if merge is unsafe due to validity drop."""
        # Setup mock evaluator where merge validity drops heavily (unsafe)
        mock_eval = MockValidityEvaluator({
            "showing genuine interest in your customers": 0.8,
            "trust and credibility are crucial": 0.8,
            "showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. and credibility are crucial factors in any purchasing decision": 0.3, # low score!
            "decision-making authority": 0.8,
            "trust and credibility are crucial factors in any purchasing decision. making authority objections": 0.3  # low score!
        })
        
        stitched = stitch_text_v552(
            self.tokenized_sentences,
            self.match_scores,
            self.original_sentences,
            stitch_mode="smart",
            validity_evaluator=mock_eval
        )
        
        # Should fallback to sentence preserving: A + B (e.g. "...trust. Trust and...")
        self.assertIn("rapport and trust. Trust and credibility", stitched)
        self.assertIn("purchasing decision. Decision-making authority", stitched)

if __name__ == "__main__":
    unittest.main()
