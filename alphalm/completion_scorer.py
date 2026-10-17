from typing import List

CONCLUDING_ROOTS = {
    "conclusion", "summarize", "summary", "finally", "ultimately",
    "overall", "lastly", "conclude", "satisfaction", "successfully",
    "outcome", "relationship", "loyalty", "result", "finish", "end",
    "closing", "recommendation", "achieve", "success", "trust", "nurture"
}

def compute_completion_score(words: List[str], current_step: int, total_steps: int) -> float:
    """
    Computes a score indicating how concluding or resolving a sentence feels.
    It checks for concluding transition words, scaled by the progress ratio
    (current_step / total_steps) so that conclusion markers are preferred
    near the end of generation, but not at the beginning.
    """
    if not words or total_steps <= 0:
        return 0.0
        
    # Count occurrence of concluding words
    match_count = sum(1 for w in words if w in CONCLUDING_ROOTS)
    
    # Progress ratio: ranges from 0.0 at the start to 1.0 at the end
    progress_ratio = min(1.0, current_step / total_steps)
    
    # Calculate density of concluding words in the sentence
    density = match_count / len(words) if len(words) > 0 else 0.0
    
    # If we are in the last quarter of generation (progress_ratio > 0.75), 
    # give concluding sentences a strong boost, otherwise scale by progress.
    if progress_ratio > 0.75 and match_count > 0:
        return float(0.2 + 0.8 * density) * progress_ratio
        
    return float(density * progress_ratio)
