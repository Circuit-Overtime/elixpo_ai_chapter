from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple
import numpy as np
from gensim.models import Word2Vec
import config
from tokenizer import clean_and_tokenize, get_prefix, get_suffix
from scoring.length_penalty import compute_length_penalty
from scoring.repetition_sentence import compute_sentence_repetition
from scoring.repetition_semantic import compute_semantic_repetition
from scoring.repetition_topic import compute_topic_repetition
from scoring.topic_progress import compute_topic_progress
from keyword_extractor import extract_keywords
from embeddings import get_mean_vector
from scorer import get_exact_match_score
from similarity import compute_semantic_similarity
from path_scorer import compute_local_coherence, compute_global_coherence
from completion_scorer import compute_completion_score
from rendering.stitcher import stitch_text_v552
from utils import log_info


@dataclass
class SearchPath:
    """Dataclass representing a candidate generated path in the search space."""
    sentence_indices: List[int]
    generated_text: str = ""
    local_scores: List[float] = field(default_factory=list)
    global_scores: List[float] = field(default_factory=list)
    makes_sense_scores: List[float] = field(default_factory=list)
    policy_scores: List[float] = field(default_factory=list)
    validity_scores: List[float] = field(default_factory=list)
    total_score: float = 0.0
    match_scores: List[int] = field(default_factory=list)
    step_details: List[Dict[str, Any]] = field(default_factory=list)
    # v5.5.3 — Repetition tracking fields
    sentence_embeddings: List[np.ndarray] = field(default_factory=list)
    topic_memory: np.ndarray = field(default_factory=lambda: np.zeros(1, dtype=np.float32))
    repetition_penalties: List[float] = field(default_factory=list)
    topic_progress_bonuses: List[float] = field(default_factory=list)

    def clone(self) -> 'SearchPath':
        return SearchPath(
            sentence_indices=list(self.sentence_indices),
            generated_text=self.generated_text,
            local_scores=list(self.local_scores),
            global_scores=list(self.global_scores),
            makes_sense_scores=list(self.makes_sense_scores),
            policy_scores=list(self.policy_scores),
            validity_scores=list(self.validity_scores),
            total_score=self.total_score,
            match_scores=list(self.match_scores),
            step_details=list(self.step_details),
            sentence_embeddings=list(self.sentence_embeddings),
            topic_memory=self.topic_memory.copy(),
            repetition_penalties=list(self.repetition_penalties),
            topic_progress_bonuses=list(self.topic_progress_bonuses),
        )


class AlphaLMSearcher:
    """Orchestrates candidate sentence search and path-level scoring using Beam Search."""
    def __init__(
        self,
        corpus_sentences: List[str],
        w2v_model: Word2Vec,
        makes_sense_evaluator=None,
        policy_head=None,
        sentence_validity_evaluator=None
    ):
        self.sentences = corpus_sentences
        self.model = w2v_model
        self.makes_sense_evaluator = makes_sense_evaluator
        self.policy_head = policy_head
        self.sentence_validity_evaluator = sentence_validity_evaluator

        # Precompute tokenized words and keywords for fast search execution using spaCy batching
        log_info("Pre-computing tokenized sentences and keywords using spaCy batching...")
        from tokenizer import nlp, _TOKEN_CACHE
        from keyword_extractor import CONTENT_POS, _KEYWORD_CACHE
        
        self.tokenized_sentences = []
        self.keywords = []
        
        for doc in nlp.pipe(corpus_sentences, batch_size=2048):
            # 1. Extract clean tokens
            tokens = []
            for t in doc:
                if not t.is_space and not t.is_punct and not t.is_quote:
                    word = t.text.lower().strip()
                    if word:
                        tokens.append(word)
            
            # 2. Extract keywords
            keywords = []
            for t in doc:
                if not t.is_space and not t.is_punct and not t.is_quote:
                    if t.pos_ in CONTENT_POS and not t.is_stop:
                        lemma = t.lemma_.lower().strip()
                        val = lemma if lemma else t.text.lower().strip()
                        if val:
                            keywords.append(val)
            
            # Update caches
            sent_text = doc.text
            _TOKEN_CACHE[sent_text] = tokens
            _KEYWORD_CACHE[sent_text] = keywords
            
            self.tokenized_sentences.append(tokens)
            self.keywords.append(keywords)

        # v5.5.3: Pre-compute sentence embeddings for the full corpus
        log_info("Pre-computing sentence embedding cache for repetition scoring...")
        self.sentence_vecs = [
            get_mean_vector(self.model, toks)
            for toks in self.tokenized_sentences
        ]

        # Pre-populate evaluator sentence embedding cache to optimize search speed
        if self.makes_sense_evaluator is not None:
            log_info("Pre-populating evaluator sentence embedding cache...")
            for sent, tokens in zip(self.sentences, self.tokenized_sentences):
                mean_vec = get_mean_vector(
                    self.makes_sense_evaluator.wv
                    if hasattr(self.makes_sense_evaluator, "wv")
                    else self.makes_sense_evaluator.w2v,
                    tokens
                )
                self.makes_sense_evaluator.embedding_cache[sent] = mean_vec

        # Pre-populate policy head sentence embedding cache to optimize search speed
        if self.policy_head is not None:
            log_info("Pre-populating policy head sentence embedding cache...")
            for sent, tokens in zip(self.sentences, self.tokenized_sentences):
                mean_vec = get_mean_vector(
                    self.policy_head.wv
                    if hasattr(self.policy_head, "wv")
                    else self.policy_head.w2v,
                    tokens
                )
                self.policy_head.embedding_cache[sent] = mean_vec

        # Pre-populate sentence validity cache to optimize search speed
        self.validity_scores_cache = {}
        if self.sentence_validity_evaluator is not None:
            log_info("Pre-populating sentence validity evaluator cache...")
            scores = self.sentence_validity_evaluator.score_sentences(self.sentences)
            self.validity_scores_cache = {idx: score for idx, score in enumerate(scores)}

    def evaluate_transition(
        self,
        history_indices: List[int],
        cand_idx: int,
        current_step: int,
        total_steps: int,
        weights: Dict[str, float] = None,
        precomputed_makes_sense: float = None,
        precomputed_policy: float = None,
        precomputed_validity: float = None,
        # v5.5.3 repetition state
        history_vecs: List[np.ndarray] = None,
        topic_memory_vec: np.ndarray = None,
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Scores the connection from the last sentence in history to a candidate sentence.
        Includes all v5.5.2 components plus the v5.5.3 Multi-Level Repetition Penalty.
        """
        if weights is None:
            weights = {
                "boundary": config.WEIGHT_BOUNDARY,
                "local": config.WEIGHT_LOCAL,
                "global": config.WEIGHT_GLOBAL,
                "completion": config.WEIGHT_COMPLETION,
                "makes_sense": getattr(config, "WEIGHT_MAKES_SENSE", 0.0),
                "policy": getattr(config, "WEIGHT_POLICY", 0.0),
                "validity": getattr(config, "WEIGHT_VALIDITY", 0.0),
                "sentence_rep": getattr(config, "WEIGHT_SENTENCE_REP", 1.0),
                "semantic_rep": getattr(config, "WEIGHT_SEMANTIC_REP", 0.75),
                "topic_rep": getattr(config, "WEIGHT_TOPIC_REP", 1.25),
                "topic_progress": getattr(config, "WEIGHT_TOPIC_PROGRESS", 0.5),
            }

        last_idx = history_indices[-1]

        # 1. Boundary score (exact match or Word2Vec boundary similarity)
        curr_words = self.tokenized_sentences[last_idx]
        cand_words = self.tokenized_sentences[cand_idx]

        curr_suffix = get_suffix(curr_words, config.BOUNDARY_SIZE)
        cand_prefix = get_prefix(cand_words, config.BOUNDARY_SIZE)

        exact = get_exact_match_score(curr_suffix, cand_prefix)
        sem = compute_semantic_similarity(self.model, curr_suffix, cand_prefix)

        # Exact boundary match priority (score >= 10.0), else fallback to semantic similarity
        boundary_score = (10.0 + exact) if exact > 0 else sem

        # 2. Local coherence
        local_coh = compute_local_coherence(self.model, curr_words, cand_words)

        # 3. Global coherence over context window of sentence words
        history_words = [self.tokenized_sentences[idx] for idx in history_indices]
        global_coh = compute_global_coherence(self.model, history_words, cand_words, config.GLOBAL_WINDOW_SIZE)

        # 4. Completion score (defaults to 0.0)
        comp_score = compute_completion_score(cand_words, current_step, total_steps)

        # 5. Makes-Sense evaluator score
        w_makes_sense = weights.get("makes_sense", 0.0)
        makes_sense_score = 0.0
        if w_makes_sense > 0.0:
            if precomputed_makes_sense is not None:
                makes_sense_score = precomputed_makes_sense
            elif self.makes_sense_evaluator is not None:
                path_sentences = [self.sentences[idx] for idx in history_indices] + [self.sentences[cand_idx]]
                makes_sense_score = self.makes_sense_evaluator.score_trajectory(path_sentences)

        # 6. Policy Head score
        w_policy = weights.get("policy", 0.0)
        policy_score = 0.0
        if w_policy > 0.0:
            if precomputed_policy is not None:
                policy_score = precomputed_policy
            elif self.policy_head is not None:
                path_sentences = [self.sentences[idx] for idx in history_indices] + [self.sentences[cand_idx]]
                policy_score = self.policy_head.score_candidates(path_sentences[:-1], [path_sentences[-1]])[0]

        # 7. Sentence Validity score
        w_validity = weights.get("validity", 0.0)
        validity_score = 0.0
        validity_penalty = 0.0
        if w_validity > 0.0:
            if precomputed_validity is not None:
                validity_score = precomputed_validity
            elif self.sentence_validity_evaluator is not None:
                validity_score = self.validity_scores_cache.get(cand_idx, None)
                if validity_score is None:
                    validity_score = self.sentence_validity_evaluator.score_sentence(self.sentences[cand_idx])

            # Apply v2-specific penalties: low-validity gate and length penalty
            is_v2 = (self.sentence_validity_evaluator.__class__.__name__ in ("SentenceValidityEvaluatorV2", "SentenceValidityEvaluatorTransformer"))
            if is_v2:
                if validity_score < 0.4:
                    validity_penalty += -2.0 * (0.4 - validity_score) / 0.4
                num_tokens = len(self.tokenized_sentences[cand_idx])
                validity_penalty += compute_length_penalty(num_tokens, validity_score)

        # 8. v5.5.3 — Multi-Level Repetition Penalty
        w_sent_rep  = weights.get("sentence_rep", getattr(config, "WEIGHT_SENTENCE_REP", 1.0))
        w_sem_rep   = weights.get("semantic_rep", getattr(config, "WEIGHT_SEMANTIC_REP", 0.75))
        w_topic_rep = weights.get("topic_rep", getattr(config, "WEIGHT_TOPIC_REP", 1.25))
        w_progress  = weights.get("topic_progress", getattr(config, "WEIGHT_TOPIC_PROGRESS", 0.5))

        cand_vec = self.sentence_vecs[cand_idx]
        hist_vecs = history_vecs if history_vecs is not None else []
        t_mem = topic_memory_vec if (topic_memory_vec is not None and np.linalg.norm(topic_memory_vec) > 1e-9) else np.zeros_like(cand_vec)

        # Compute history texts for exact-match check
        history_texts = [self.sentences[idx] for idx in history_indices]

        sentence_rep   = compute_sentence_repetition(self.sentences[cand_idx], history_texts)
        semantic_rep   = compute_semantic_repetition(cand_vec, hist_vecs)
        topic_rep      = compute_topic_repetition(cand_vec, t_mem)
        topic_progress = compute_topic_progress(cand_vec, hist_vecs)

        repetition_penalty = (
            w_sent_rep  * sentence_rep
            + w_sem_rep   * semantic_rep
            + w_topic_rep * topic_rep
            - w_progress  * topic_progress
        )

        # Composite score (positive components minus repetition penalty)
        total_score = (
            weights["boundary"] * boundary_score
            + weights["local"]   * local_coh
            + weights["global"]  * global_coh
            + weights["completion"] * comp_score
            + w_makes_sense * makes_sense_score
            + w_policy      * policy_score
            + w_validity    * (validity_score + validity_penalty)
            - repetition_penalty
        )

        details = {
            "index": cand_idx,
            "text": self.sentences[cand_idx],
            "exact_match": exact,
            "semantic_similarity": sem,
            "boundary_score": boundary_score,
            "local_coherence": local_coh,
            "global_coherence": global_coh,
            "completion_score": comp_score,
            "makes_sense_score": makes_sense_score,
            "policy_score": policy_score,
            "validity_score": validity_score,
            "validity_penalty": validity_penalty,
            # v5.5.3 repetition details
            "sentence_rep": sentence_rep,
            "semantic_rep": semantic_rep,
            "topic_rep": topic_rep,
            "topic_progress": topic_progress,
            "repetition_penalty": repetition_penalty,
            "total_score": total_score,
        }

        return total_score, details

    def search(
        self,
        seed_idx: int,
        num_sentences: int,
        beam_width: int = None,
        weights: Dict[str, float] = None,
        stitch_mode: str = "sentence_preserving"
    ) -> Tuple['SearchPath', List[Dict[str, Any]]]:
        """
        Executes a Beam Search (width B) to discover the highest-scoring path of sentences.
        v5.5.3: Each beam path now carries sentence_embeddings and a topic_memory vector
        that are updated at every expansion step to power the repetition penalty system.

        Returns:
          - The best SearchPath object.
          - A list of step logs.
        """
        if beam_width is None:
            beam_width = config.DEFAULT_BEAM_WIDTH

        if seed_idx < 0 or seed_idx >= len(self.sentences):
            raise ValueError(f"Seed index {seed_idx} out of range (size: {len(self.sentences)})")

        if weights is None:
            weights = {
                "boundary":      config.WEIGHT_BOUNDARY,
                "local":         config.WEIGHT_LOCAL,
                "global":        config.WEIGHT_GLOBAL,
                "completion":    config.WEIGHT_COMPLETION,
                "makes_sense":   getattr(config, "WEIGHT_MAKES_SENSE", 0.0),
                "policy":        getattr(config, "WEIGHT_POLICY", 0.0),
                "validity":      getattr(config, "WEIGHT_VALIDITY", 0.0),
                "sentence_rep":  getattr(config, "WEIGHT_SENTENCE_REP", 1.0),
                "semantic_rep":  getattr(config, "WEIGHT_SEMANTIC_REP", 0.75),
                "topic_rep":     getattr(config, "WEIGHT_TOPIC_REP", 1.25),
                "topic_progress": getattr(config, "WEIGHT_TOPIC_PROGRESS", 0.5),
            }

        # Initialize the seed path with the seed sentence embedding and topic memory
        seed_vec = self.sentence_vecs[seed_idx]
        seed_path = SearchPath(
            sentence_indices=[seed_idx],
            total_score=0.0,
            sentence_embeddings=[seed_vec],
            topic_memory=seed_vec.copy(),
        )
        beams = [seed_path]
        step_logs = []

        for step in range(1, num_sentences):
            candidates_expanded: List[SearchPath] = []
            step_decisions = []

            for path in beams:
                last_idx = path.sentence_indices[-1]
                path_expansions = []

                # 1. Gather valid candidate indices
                candidate_indices = []
                for cand_idx in range(len(self.sentences)):
                    if cand_idx == last_idx:
                        continue
                    if not config.ALLOW_REUSE and cand_idx in path.sentence_indices:
                        continue
                    candidate_indices.append(cand_idx)

                # 2. Policy Head early pruning
                w_policy = weights.get("policy", 0.0)
                policy_cache = {}

                if self.policy_head is not None and w_policy > 0.0:
                    history_sentences = [self.sentences[idx] for idx in path.sentence_indices]
                    candidate_sents = [self.sentences[idx] for idx in candidate_indices]

                    if not self.policy_head.use_scalar:
                        p_scores = self.policy_head.score_candidates(history_sentences, candidate_sents)
                        policy_cache = {idx: score for idx, score in zip(candidate_indices, p_scores)}
                        candidate_indices.sort(key=lambda idx: policy_cache[idx], reverse=True)
                        candidate_indices = candidate_indices[:100]
                elif len(self.sentences) > 5000:
                    # Fast fallback heuristic pruning using precomputed sentence embeddings
                    from similarity import cosine_similarity
                    last_vec = self.sentence_vecs[last_idx]
                    similarities = []
                    for cand_idx in candidate_indices:
                        cand_vec = self.sentence_vecs[cand_idx]
                        sim = cosine_similarity(last_vec, cand_vec)
                        similarities.append((sim, cand_idx))
                    similarities.sort(key=lambda x: x[0], reverse=True)
                    candidate_indices = [idx for _, idx in similarities[:150]]

                # 3. Batch Makes-Sense scoring
                makes_sense_cache = {}
                w_makes_sense = weights.get("makes_sense", 0.0)
                if self.makes_sense_evaluator is not None and w_makes_sense > 0.0:
                    history_sentences = [self.sentences[idx] for idx in path.sentence_indices]
                    filtered_sents = [self.sentences[idx] for idx in candidate_indices]
                    scores = self.makes_sense_evaluator.score_candidates(history_sentences, filtered_sents)
                    makes_sense_cache = {idx: score for idx, score in zip(candidate_indices, scores)}

                # 4. Final evaluation for each candidate
                for cand_idx in candidate_indices:
                    score, details = self.evaluate_transition(
                        path.sentence_indices,
                        cand_idx,
                        step,
                        num_sentences,
                        weights,
                        precomputed_makes_sense=makes_sense_cache.get(cand_idx, None),
                        precomputed_policy=policy_cache.get(cand_idx, None),
                        precomputed_validity=self.validity_scores_cache.get(cand_idx, None),
                        history_vecs=path.sentence_embeddings,
                        topic_memory_vec=path.topic_memory,
                    )
                    path_expansions.append((score, cand_idx, details))

                path_expansions.sort(key=lambda x: x[0], reverse=True)

                if not path_expansions:
                    candidates_expanded.append(path)
                    continue

                # Expand to top candidates, updating repetition state
                for score, cand_idx, details in path_expansions[:beam_width]:
                    new_path = path.clone()
                    cand_vec = self.sentence_vecs[cand_idx]

                    new_path.sentence_indices.append(cand_idx)
                    new_path.total_score += score
                    new_path.match_scores.append(details["exact_match"])
                    new_path.local_scores.append(details["local_coherence"])
                    new_path.global_scores.append(details["global_coherence"])
                    new_path.makes_sense_scores.append(details.get("makes_sense_score", 0.0))
                    new_path.policy_scores.append(details.get("policy_score", 0.0))
                    new_path.validity_scores.append(details.get("validity_score", 0.0))
                    new_path.step_details.append(details)

                    # v5.5.3: Update repetition state
                    new_path.sentence_embeddings.append(cand_vec)
                    all_vecs = np.stack(new_path.sentence_embeddings)
                    new_path.topic_memory = np.mean(all_vecs, axis=0)
                    new_path.repetition_penalties.append(details.get("repetition_penalty", 0.0))
                    new_path.topic_progress_bonuses.append(details.get("topic_progress", 0.0))

                    candidates_expanded.append(new_path)

                # Track transitions for explainability
                step_decisions.append({
                    "parent_path": path.sentence_indices,
                    "expansions": [item[2] for item in path_expansions]
                })

            if not candidates_expanded:
                break

            # Keep top-K beams ranked by total score
            candidates_expanded.sort(key=lambda x: x.total_score, reverse=True)
            beams = candidates_expanded[:beam_width]

            # Log the best beam's decision at this step
            best_beam = beams[0]
            parent_indices = best_beam.sentence_indices[:-1]
            best_decision_info = next(
                (d for d in step_decisions if d["parent_path"] == parent_indices), None
            )

            if best_decision_info:
                step_logs.append({
                    "step": step,
                    "selected": best_decision_info["expansions"][0],
                    "rejected": best_decision_info["expansions"][1:6]
                })

        # Return best path with stitched text
        best_path = beams[0]
        tokenized_seq = [self.tokenized_sentences[idx] for idx in best_path.sentence_indices]
        original_seq  = [self.sentences[idx] for idx in best_path.sentence_indices]
        best_path.generated_text = stitch_text_v552(
            tokenized_seq,
            best_path.match_scores,
            original_seq,
            stitch_mode=stitch_mode,
            validity_evaluator=self.sentence_validity_evaluator
        )

        return best_path, step_logs
