import numpy as np
from tokenizer import split_into_sentences, clean_and_tokenize, get_prefix, get_suffix
from keyword_extractor import extract_keywords, compute_keyword_jaccard
from embeddings import train_word2vec, get_mean_vector
from similarity import cosine_similarity, compute_semantic_similarity
from scorer import get_exact_match_score, score_candidate
from quilter import stitch_text
from path_scorer import compute_local_coherence, compute_global_coherence
from completion_scorer import compute_completion_score
from search import AlphaLMSearcher, SearchPath
from metrics import generate_path_report, compute_average, compute_variance, compute_trend_slope

def test_tokenizer():
    print("Running tokenizer tests...")
    text = "Hello world! This is a simple test sentence, isn't it?"
    sents = split_into_sentences(text)
    assert len(sents) == 2, f"Expected 2 sentences, got {len(sents)}"
    assert sents[0] == "Hello world!", f"Got: {sents[0]}"
    
    words = clean_and_tokenize("Hello, world!")
    assert words == ["hello", "world"], f"Got: {words}"
    
    prefix = get_prefix(words, 1)
    assert prefix == ["hello"], f"Got: {prefix}"
    
    suffix = get_suffix(words, 1)
    assert suffix == ["world"], f"Got: {suffix}"
    print("Tokenizer tests passed!")

def test_keywords():
    print("Running keyword extraction tests...")
    kws = extract_keywords("Building rapport is a fundamental skill in sales.")
    assert "rapport" in kws
    assert "skill" in kws
    assert "sale" in kws
    assert "is" not in kws
    
    a = ["rapport", "sales", "trust"]
    b = ["rapport", "trust", "credibility"]
    jac = compute_keyword_jaccard(a, b)
    assert abs(jac - 0.5) < 1e-5, f"Expected 0.5, got {jac}"
    print("Keyword extraction tests passed!")

def test_scorer_exact_match():
    print("Running exact match scorer tests...")
    suffix = ["go", "for", "a", "walk"]
    prefix = ["walk", "in", "the", "park"]
    score = get_exact_match_score(suffix, prefix)
    assert score == 1, f"Expected 1, got {score}"
    print("Exact match scorer tests passed!")

def test_stitching():
    print("Running stitching tests...")
    sents = [
        ["i", "go", "for", "a", "walk"],
        ["walk", "in", "the", "park"],
        ["it", "is", "nice"]
    ]
    scores = [1, 0]
    text = stitch_text(sents, scores)
    expected = "I go for a walk in the park. It is nice."
    assert text == expected, f"Expected: '{expected}', Got: '{text}'"
    print("Stitching tests passed!")

def test_path_scoring_and_completion():
    print("Running path scorer and completion scorer tests...")
    sentences = [
        ["rapport", "customer", "trust"],
        ["customer", "satisfaction", "outcome"],
        ["nurture", "relationship", "loyalty"],
        ["finally", "summarize", "conclusion"]
    ]
    w2v = train_word2vec(sentences)
    
    # 1. Local coherence
    coh_score = compute_local_coherence(w2v, sentences[0], sentences[1])
    assert coh_score > -1.0 and coh_score <= 1.0, f"Local coherence out of range: {coh_score}"
    
    # 2. Global coherence (uses full sentences list in v3)
    history = [sentences[0], sentences[1]]
    glob_score = compute_global_coherence(w2v, history, sentences[2], window_size=2)
    assert glob_score > -1.0 and glob_score <= 1.0, f"Global coherence out of range: {glob_score}"
    
    # 3. Completion score
    score_early = compute_completion_score(sentences[3], current_step=1, total_steps=8)
    score_late = compute_completion_score(sentences[3], current_step=7, total_steps=8)
    assert score_late > score_early, f"Expected late completion score {score_late} to exceed early score {score_early}"
    
    print("Path and completion scorer tests passed!")

def test_metrics():
    print("Running metrics module tests...")
    local_vals = [0.8, 0.9, 0.85]
    global_vals = [0.7, 0.75, 0.82]
    match_vals = [1, 0, 2]
    
    avg_l = compute_average(local_vals)
    assert abs(avg_l - 0.85) < 1e-5
    
    var_g = compute_variance(global_vals)
    assert var_g >= 0.0
    
    trend = compute_trend_slope(global_vals)
    # Global scores are increasing, so trend should be positive
    assert trend > 0.0, f"Expected positive trend, got {trend}"
    
    report = generate_path_report([0, 1, 2, 3], local_vals, global_vals, match_vals, 15.5)
    assert report["exact_boundary_matches"] == 2
    assert report["avg_local_coherence"] == avg_l
    assert report["global_coherence_trend"] == trend
    print("Metrics module tests passed!")

def test_beam_search():
    print("Running beam search tests...")
    corpus = [
        "Building rapport is a fundamental skill in sales.",
        "Sales is not just about selling a product or service.",
        "Product or service features are important to showcase.",
        "Showcase your unique selling points clearly.",
        "Establishing a connection is crucial for trust."
    ]
    tokenized = [clean_and_tokenize(s) for s in corpus]
    w2v = train_word2vec(tokenized)
    
    searcher = AlphaLMSearcher(corpus, w2v)
    
    # Test beam width = 1
    best_path_b1, logs_b1 = searcher.search(seed_idx=0, num_sentences=4, beam_width=1)
    assert isinstance(best_path_b1, SearchPath)
    assert len(best_path_b1.sentence_indices) == 4
    assert len(best_path_b1.local_scores) == 3
    assert len(best_path_b1.global_scores) == 3
    assert len(logs_b1) == 3
    
    # Test beam width = 5 (v3 default)
    best_path_b5, logs_b5 = searcher.search(seed_idx=0, num_sentences=4, beam_width=5)
    assert isinstance(best_path_b5, SearchPath)
    assert len(best_path_b5.sentence_indices) == 4
    assert len(logs_b5) == 3
    assert len(best_path_b5.generated_text) > 0
    print("Beam search tests passed!")

if __name__ == "__main__":
    print("--- Starting AlphaLM v3 Unit Tests ---")
    test_tokenizer()
    test_keywords()
    test_scorer_exact_match()
    test_stitching()
    test_path_scoring_and_completion()
    test_metrics()
    test_beam_search()
    print("--- All Tests Passed Successfully! ---")
