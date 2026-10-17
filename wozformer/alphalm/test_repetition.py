"""
AlphaLM v5.5.3 — Unit Tests: Multi-Level Repetition Control
=============================================================
Tests for all four scoring components:
  - SentenceRepetition  (scoring/repetition_sentence.py)
  - SemanticRepetition  (scoring/repetition_semantic.py)
  - TopicRepetition     (scoring/repetition_topic.py)
  - TopicProgress       (scoring/topic_progress.py)
"""

import sys
import unittest
import numpy as np
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from scoring.repetition_sentence import compute_sentence_repetition
from scoring.repetition_semantic import compute_semantic_repetition, cosine_similarity
from scoring.repetition_topic import compute_topic_repetition
from scoring.topic_progress import compute_topic_progress


# ---------------------------------------------------------------------------
# 1. Sentence Repetition Tests
# ---------------------------------------------------------------------------
class TestSentenceRepetition(unittest.TestCase):

    def test_exact_duplicate_returns_one(self):
        history = [
            "Trust is the foundation of every sale.",
            "Active listening builds rapport with prospects."
        ]
        candidate = "Trust is the foundation of every sale."
        self.assertEqual(compute_sentence_repetition(candidate, history), 1.0)

    def test_case_insensitive_duplicate(self):
        history = ["Trust is essential."]
        self.assertEqual(compute_sentence_repetition("TRUST IS ESSENTIAL.", history), 1.0)

    def test_whitespace_normalised(self):
        history = ["  Trust is essential.  "]
        self.assertEqual(compute_sentence_repetition("Trust is essential.", history), 1.0)

    def test_novel_sentence_returns_zero(self):
        history = ["Trust is essential.", "Credibility matters."]
        self.assertEqual(compute_sentence_repetition("Product knowledge closes deals.", history), 0.0)

    def test_empty_history_returns_zero(self):
        self.assertEqual(compute_sentence_repetition("Any sentence.", []), 0.0)

    def test_partial_match_does_not_trigger(self):
        history = ["Trust is essential in sales."]
        # Substring — should NOT match as exact duplicate
        self.assertEqual(compute_sentence_repetition("Trust is essential", history), 0.0)


# ---------------------------------------------------------------------------
# 2. Semantic Repetition Tests
# ---------------------------------------------------------------------------
class TestSemanticRepetition(unittest.TestCase):

    def _unit(self, vals):
        v = np.array(vals, dtype=np.float32)
        return v / np.linalg.norm(v)

    def test_identical_vector_high_penalty(self):
        vec = self._unit([1.0, 0.0, 0.0])
        penalty = compute_semantic_repetition(vec, [vec])
        # cos sim = 1.0 → penalty = max(0, 1.0 - 0.85) = 0.15
        self.assertAlmostEqual(penalty, 0.15, places=4)

    def test_opposite_vector_no_penalty(self):
        vec_a = self._unit([1.0, 0.0, 0.0])
        vec_b = self._unit([-1.0, 0.0, 0.0])
        penalty = compute_semantic_repetition(vec_a, [vec_b])
        self.assertEqual(penalty, 0.0)

    def test_above_threshold_triggers_penalty(self):
        vec_a = self._unit([1.0, 0.1, 0.0])
        vec_b = self._unit([1.0, 0.0, 0.0])
        sim = cosine_similarity(vec_a, vec_b)
        if sim > 0.85:
            self.assertGreater(compute_semantic_repetition(vec_a, [vec_b]), 0.0)
        else:
            self.assertEqual(compute_semantic_repetition(vec_a, [vec_b]), 0.0)

    def test_empty_history_returns_zero(self):
        vec = self._unit([1.0, 0.0, 0.0])
        self.assertEqual(compute_semantic_repetition(vec, []), 0.0)

    def test_zero_candidate_returns_zero(self):
        zero = np.zeros(3, dtype=np.float32)
        vec  = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        self.assertEqual(compute_semantic_repetition(zero, [vec]), 0.0)

    def test_penalty_clamped_to_one(self):
        # Perfect similarity → 1.0 - 0.85 = 0.15, well below 1.0 cap
        vec = self._unit([1.0, 0.0, 0.0])
        penalty = compute_semantic_repetition(vec, [vec])
        self.assertLessEqual(penalty, 1.0)

    def test_custom_threshold(self):
        vec = self._unit([1.0, 0.0, 0.0])
        # With threshold 0.5, penalty = 1.0 - 0.5 = 0.5
        penalty = compute_semantic_repetition(vec, [vec], threshold=0.5)
        self.assertAlmostEqual(penalty, 0.5, places=4)


# ---------------------------------------------------------------------------
# 3. Topic Repetition Tests
# ---------------------------------------------------------------------------
class TestTopicRepetition(unittest.TestCase):

    def _unit(self, vals):
        v = np.array(vals, dtype=np.float32)
        return v / np.linalg.norm(v)

    def test_same_direction_as_memory_penalised(self):
        mem = self._unit([1.0, 0.0, 0.0])
        cand = self._unit([1.0, 0.0, 0.0])
        # cos sim = 1.0 → penalty = max(0, 1.0 - 0.75) = 0.25
        self.assertAlmostEqual(compute_topic_repetition(cand, mem), 0.25, places=4)

    def test_orthogonal_no_penalty(self):
        mem  = self._unit([1.0, 0.0, 0.0])
        cand = self._unit([0.0, 1.0, 0.0])
        # cos sim = 0.0 → below threshold
        self.assertEqual(compute_topic_repetition(cand, mem), 0.0)

    def test_zero_memory_no_penalty(self):
        zero = np.zeros(3, dtype=np.float32)
        cand = self._unit([1.0, 0.0, 0.0])
        self.assertEqual(compute_topic_repetition(cand, zero), 0.0)

    def test_zero_candidate_no_penalty(self):
        mem  = self._unit([1.0, 0.0, 0.0])
        zero = np.zeros(3, dtype=np.float32)
        self.assertEqual(compute_topic_repetition(zero, mem), 0.0)

    def test_custom_threshold(self):
        mem  = self._unit([1.0, 0.0, 0.0])
        cand = self._unit([1.0, 0.0, 0.0])
        # With threshold 0.9 → penalty = max(0, 1.0 - 0.9) = 0.1
        self.assertAlmostEqual(compute_topic_repetition(cand, mem, threshold=0.9), 0.1, places=4)


# ---------------------------------------------------------------------------
# 4. Topic Progress Tests
# ---------------------------------------------------------------------------
class TestTopicProgress(unittest.TestCase):

    def _unit(self, vals):
        v = np.array(vals, dtype=np.float32)
        return v / np.linalg.norm(v)

    def test_empty_history_max_bonus(self):
        cand = self._unit([1.0, 0.0, 0.0])
        self.assertEqual(compute_topic_progress(cand, []), 1.0)

    def test_identical_vector_zero_bonus(self):
        vec  = self._unit([1.0, 0.0, 0.0])
        bonus = compute_topic_progress(vec, [vec])
        self.assertAlmostEqual(bonus, 0.0, places=4)

    def test_orthogonal_high_bonus(self):
        hist = self._unit([1.0, 0.0, 0.0])
        cand = self._unit([0.0, 1.0, 0.0])
        # cos sim = 0.0 → bonus = 1.0
        self.assertAlmostEqual(compute_topic_progress(cand, [hist]), 1.0, places=4)

    def test_bonus_clamped_to_zero_min(self):
        vec   = self._unit([1.0, 0.0, 0.0])
        bonus = compute_topic_progress(vec, [vec])
        self.assertGreaterEqual(bonus, 0.0)

    def test_bonus_clamped_to_one_max(self):
        cand = self._unit([1.0, 0.0, 0.0])
        self.assertLessEqual(compute_topic_progress(cand, []), 1.0)

    def test_zero_candidate_returns_one(self):
        # Zero candidate treated as fully novel (no overlap can be computed)
        zero = np.zeros(3, dtype=np.float32)
        hist = self._unit([1.0, 0.0, 0.0])
        bonus = compute_topic_progress(zero, [hist])
        self.assertEqual(bonus, 1.0)

    def test_partial_overlap(self):
        hist = self._unit([1.0, 0.0, 0.0])
        cand = self._unit([1.0, 1.0, 0.0])  # 45° → cos ≈ 0.707
        bonus = compute_topic_progress(cand, [hist])
        expected = 1.0 - cosine_similarity(cand, hist)
        self.assertAlmostEqual(bonus, expected, places=4)


# Needed import for the test above
from scoring.repetition_semantic import cosine_similarity

if __name__ == "__main__":
    unittest.main()
