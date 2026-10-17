def compute_length_penalty(num_words: int, validity_score: float) -> float:
    """
    Computes a smooth penalty based on sentence token length and validity score confidence.
    Returns a negative value to be added to the total search score.
    
    Penalty Behavior:
      - 10-25 words: neutral (0.0 penalty)
      - 25-40 words: mild penalty scaling from 0.0 to -0.2
      - 40-60 words: stronger penalty scaling from -0.2 to -0.6
      - 60+ words: substantial penalty starting at -0.6 and growing by -0.05 per word
      
    Confidence Gate:
      - If validity_score >= 0.8: high confidence, reduce length penalty by 80% (mitigation = 0.2)
      - If 0.5 <= validity_score < 0.8: moderate confidence, reduce penalty linearly (mitigation = 1.0 to 0.2)
      - If validity_score < 0.5: low confidence, apply the full length penalty (mitigation = 1.0)
    """
    if num_words <= 25:
        return 0.0
        
    # Calculate base penalty
    if num_words <= 40:
        # scales from 0.0 at 25 words to -0.2 at 40 words
        base_penalty = -0.2 * ((num_words - 25) / 15.0)
    elif num_words <= 60:
        # scales from -0.2 at 40 words to -0.6 at 60 words
        base_penalty = -0.2 - 0.4 * ((num_words - 40) / 20.0)
    else:
        # starts at -0.6 and grows by -0.05 per word beyond 60
        base_penalty = -0.6 - 0.05 * (num_words - 60)
        
    # Apply confidence gate mitigation
    if validity_score >= 0.8:
        mitigation = 0.2
    elif validity_score >= 0.5:
        # linear scale: at 0.5 mitigation is 1.0; at 0.8 mitigation is 0.2
        mitigation = 1.0 - 0.8 * ((validity_score - 0.5) / 0.3)
    else:
        mitigation = 1.0
        
    return base_penalty * mitigation
