import numpy as np
from typing import List, Dict, Any

def compute_average(values: List[float]) -> float:
    """Computes the arithmetic mean of a list of floats. Returns 0.0 if empty."""
    if not values:
        return 0.0
    return float(np.mean(values))

def compute_variance(values: List[float]) -> float:
    """Computes the variance of a list of floats. Returns 0.0 if empty."""
    if not values or len(values) < 2:
        return 0.0
    return float(np.var(values))

def compute_trend_slope(values: List[float]) -> float:
    """
    Computes the linear regression slope of the values over time.
    A positive slope indicates coherence is improving; negative indicates topic drift/degradation.
    """
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    slope, _ = np.polyfit(x, values, 1)
    return float(slope)

def generate_path_report(
    sentence_indices: List[int],
    local_scores: List[float],
    global_scores: List[float],
    match_scores: List[int],
    total_score: float,
    makes_sense_scores: List[float] = None,
    policy_scores: List[float] = None,
    validity_scores: List[float] = None
) -> Dict[str, Any]:
    """
    Analyzes a completed SearchPath and returns a dictionary of key metrics
    and path statistics.
    """
    exact_matches = sum(1 for m in match_scores if m > 0)
    avg_local = compute_average(local_scores)
    avg_global = compute_average(global_scores)
    
    var_local = compute_variance(local_scores)
    var_global = compute_variance(global_scores)
    
    trend_global = compute_trend_slope(global_scores)
    
    avg_makes_sense = compute_average(makes_sense_scores) if makes_sense_scores is not None else 0.0
    avg_policy = compute_average(policy_scores) if policy_scores is not None else 0.0
    avg_validity = compute_average(validity_scores) if validity_scores is not None else 0.0
    
    return {
        "path_length": len(sentence_indices),
        "total_score": total_score,
        "exact_boundary_matches": exact_matches,
        "avg_local_coherence": avg_local,
        "avg_global_coherence": avg_global,
        "variance_local_coherence": var_local,
        "variance_global_coherence": var_global,
        "global_coherence_trend": trend_global,
        "avg_makes_sense_score": avg_makes_sense,
        "avg_policy_score": avg_policy,
        "avg_validity_score": avg_validity
    }



