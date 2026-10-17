from typing import List, Dict, Any, Tuple
from gensim.models import Word2Vec
import config
from tokenizer import clean_and_tokenize, get_prefix, get_suffix
from keyword_extractor import extract_keywords
from scorer import score_candidate
from utils import log_decision, log_info

class TextQuilter:
    def __init__(self, corpus_sentences: List[str], w2v_model: Word2Vec):
        """
        Initializes the TextQuilter. Precomputes tokenization and keywords
        for all sentences in the corpus to optimize matching speed.
        """
        self.sentences = corpus_sentences
        self.model = w2v_model
        self.boundary_size = config.BOUNDARY_SIZE
        self.allow_reuse = config.ALLOW_REUSE
        
        # Precompute features
        self.tokenized_sentences = [clean_and_tokenize(s) for s in corpus_sentences]
        self.keywords = [extract_keywords(s) for s in corpus_sentences]
        
    def quilt(self, seed_idx: int, num_sentences: int) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Executes the greedy text-quilting search loop.
        Starts at seed_idx and finds the best subsequent sentences.
        Returns:
          - The final stitched text string.
          - A list of decision logs for each step.
        """
        if seed_idx < 0 or seed_idx >= len(self.sentences):
            raise ValueError(f"Seed index {seed_idx} is out of bounds (corpus size: {len(self.sentences)})")
            
        generated_indices = [seed_idx]
        used_indices = {seed_idx}
        match_scores = []
        decision_logs = []
        
        current_idx = seed_idx
        
        log_info(f"Starting quilting with seed sentence {seed_idx}: \"{self.sentences[seed_idx]}\"")
        
        for step in range(1, num_sentences):
            current_words = self.tokenized_sentences[current_idx]
            current_kw = self.keywords[current_idx]
            current_suffix = get_suffix(current_words, self.boundary_size)
            
            best_cand_idx = -1
            best_score = (-1, -2.0, -2.0)  # exact match, semantic boundary, keyword similarity
            best_reason = "No matching candidate found."
            
            # Search greedily over all sentences in the corpus
            for cand_idx in range(len(self.sentences)):
                # Skip duplicate of the current sentence
                if cand_idx == current_idx:
                    continue
                # Skip already used sentences if reuse is disabled
                if not self.allow_reuse and cand_idx in used_indices:
                    continue
                    
                cand_words = self.tokenized_sentences[cand_idx]
                cand_kw = self.keywords[cand_idx]
                cand_prefix = get_prefix(cand_words, self.boundary_size)
                
                # Score the candidate sentence
                score = score_candidate(
                    self.model,
                    current_suffix,
                    current_kw,
                    cand_prefix,
                    cand_kw
                )
                
                # Greedy comparison (lexicographical sorting: exact match first, then semantic, then keyword)
                if score > best_score:
                    best_score = score
                    best_cand_idx = cand_idx
                    
            if best_cand_idx == -1:
                log_info(f"Quilting stopped early at step {step} because no candidates were available.")
                break
                
            # Document the reason for selection
            exact_m, sem_s, kw_s = best_score
            if exact_m > 0:
                best_reason = f"Exact boundary match of length {exact_m}."
            elif sem_s > 0.0:
                best_reason = f"Semantic boundary similarity of {sem_s:.4f}."
            else:
                best_reason = f"Keyword tie-breaker similarity of {kw_s:.4f}."
                
            # Log the decision
            log_decision(step, self.sentences[best_cand_idx], best_cand_idx, best_reason, best_score)
            
            # Save step info
            decision_logs.append({
                "step": step,
                "current_index": current_idx,
                "selected_index": best_cand_idx,
                "selected_text": self.sentences[best_cand_idx],
                "score": best_score,
                "reason": best_reason
            })
            
            generated_indices.append(best_cand_idx)
            used_indices.add(best_cand_idx)
            match_scores.append(exact_m)
            current_idx = best_cand_idx
            
        # Stitch all sentences together using the computed exact match overlaps
        tokenized_seq = [self.tokenized_sentences[idx] for idx in generated_indices]
        stitched_text = stitch_text(tokenized_seq, match_scores)
        
        return stitched_text, decision_logs

def stitch_text(tokenized_sentences: List[List[str]], match_scores: List[int]) -> str:
    """
    Stitches a list of tokenized sentences using the exact match lengths.
    If match_scores[i] is m > 0, we merge by overlapping the boundary.
    If m is 0, we join them with a period if needed, and standard space.
    """
    if not tokenized_sentences:
        return ""
        
    result_words = list(tokenized_sentences[0])
    for i in range(1, len(tokenized_sentences)):
        m = match_scores[i - 1]
        words = tokenized_sentences[i]
        if m > 0:
            # Overlap: append words of the next sentence starting from index m
            result_words.extend(words[m:])
        else:
            # No overlap: add a period to the end of the last word if it doesn't have end punctuation
            if result_words and not result_words[-1].endswith((".", "!", "?")):
                result_words[-1] = result_words[-1] + "."
            result_words.extend(words)
            
    # Capitalize sentences correctly
    stitched = " ".join(result_words)
    chars = list(stitched)
    capitalize_next = True
    for idx in range(len(chars)):
        if capitalize_next and chars[idx].isalpha():
            chars[idx] = chars[idx].upper()
            capitalize_next = False
        elif chars[idx] in (".", "!", "?"):
            capitalize_next = True
            
    final_text = "".join(chars).strip()
    if final_text and not final_text[-1].endswith((".", "!", "?")):
        final_text += "."
        
    return final_text
