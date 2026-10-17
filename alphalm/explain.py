from typing import List, Dict, Any

def generate_score_breakdown(scores: Dict[str, Any]) -> str:
    """
    Formulates a detailed human-readable breakdown of a candidate's score components.
    """
    exact = scores.get("exact_match", 0)
    sem = scores.get("semantic_similarity", 0.0)
    local = scores.get("local_coherence", 0.0)
    glob = scores.get("global_coherence", 0.0)
    comp = scores.get("completion_score", 0.0)
    makes_sense = scores.get("makes_sense_score", 0.0)
    policy = scores.get("policy_score", 0.0)
    validity = scores.get("validity_score", 0.0)
    total = scores.get("total_score", 0.0)
    
    breakdown = (
        f"Total: {total:.4f} | "
        f"Boundary: {'Exact Match (' + str(exact) + ' words)' if exact > 0 else 'Semantic Sim (' + f'{sem:.4f}' + ')'} | "
        f"Local Coherence: {local:.4f} | "
        f"Global Coherence: {glob:.4f} | "
        f"Completion: {comp:.4f} | "
        f"Makes-Sense: {makes_sense:.4f} | "
        f"Policy: {policy:.4f} | "
        f"Validity: {validity:.4f}"
    )
    return breakdown



def explain_decision(
    step: int,
    selected_text: str,
    selected_idx: int,
    selected_scores: Dict[str, Any],
    top_rejected: List[Dict[str, Any]]
) -> str:
    """
    Generates a detailed human-readable narrative explaining why the selected
    sentence was chosen at the current step and why the top alternatives were rejected.
    """
    exact = selected_scores.get("exact_match", 0)
    sem = selected_scores.get("semantic_similarity", 0.0)
    local = selected_scores.get("local_coherence", 0.0)
    glob = selected_scores.get("global_coherence", 0.0)
    comp = selected_scores.get("completion_score", 0.0)
    
    # Core rationale statement
    if exact > 0:
        rationale = f"Selected because it offers a direct word-overlap boundary match of length {exact} ('{selected_text.split()[:exact]}')."
    elif sem > 0.8:
        rationale = f"Selected because it has a very strong semantic boundary continuation of {sem:.4f}."
    else:
        rationale = f"Selected as the best semantic continuation (boundary similarity: {sem:.4f}) with balanced coherence."
        
    explanation = [
        f"=== STEP {step} DECISION EXPLANATION ===",
        f"Chosen Index {selected_idx}: \"{selected_text[:80]}...\"",
        f"Rationale: {rationale}",
        f"Score Details: {generate_score_breakdown(selected_scores)}"
    ]
    
    if top_rejected:
        explanation.append("\nTop Rejected Alternatives:")
        for idx, alt in enumerate(top_rejected[:3]):
            alt_text = alt.get("text", "")
            alt_scores = alt
            explanation.append(
                f"  {idx + 1}. Candidate {alt.get('index')}: \"{alt_text[:60]}...\"\n"
                f"     Scores -> {generate_score_breakdown(alt_scores)}"
            )
            
    explanation.append("=" * 40 + "\n")
    return "\n".join(explanation)
