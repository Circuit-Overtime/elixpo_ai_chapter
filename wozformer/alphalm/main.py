import argparse
from pathlib import Path
import config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from embeddings import train_word2vec
from search import AlphaLMSearcher
from explain import explain_decision
from metrics import generate_path_report
from utils import log_info, set_seed

def main():
    parser = argparse.ArgumentParser(description="AlphaLM v3 - Trajectory Search Language Engine CLI")
    parser.add_argument("--corpus", type=str, default=str(config.CORPUS_PATH),
                        help="Path to the source text corpus")
    parser.add_argument("--seed-idx", type=int, default=20,
                        help="Index of the seed sentence to start quilting")
    parser.add_argument("--num-sentences", type=int, default=config.DEFAULT_NUM_SENTENCES,
                        help="Number of sentences to generate")
    parser.add_argument("--boundary-size", type=int, default=config.BOUNDARY_SIZE,
                        help="Number of words to match at boundaries")
    parser.add_argument("--beam-width", type=int, default=config.DEFAULT_BEAM_WIDTH,
                        help="Beam width for search (1 = greedy, default = 5)")
    parser.add_argument("--allow-reuse", action="store_true", default=config.ALLOW_REUSE,
                        help="Allow reuse of sentences during generation")
    
    # Path scoring weights
    parser.add_argument("--w-boundary", type=float, default=config.WEIGHT_BOUNDARY,
                        help="Weight for boundary matching score component")
    parser.add_argument("--w-local", type=float, default=config.WEIGHT_LOCAL,
                        help="Weight for local coherence component")
    parser.add_argument("--w-global", type=float, default=config.WEIGHT_GLOBAL,
                        help="Weight for global coherence component")
    parser.add_argument("--w-makes-sense", type=float, default=config.WEIGHT_MAKES_SENSE,
                        help="Weight for the learned makes-sense score component")
    parser.add_argument("--use-evaluator", action="store_true", default=False,
                        help="Enable the learned 'Makes-Sense' evaluator")
    parser.add_argument("--w-policy", type=float, default=config.WEIGHT_POLICY,
                        help="Weight for the learned policy head score component")
    parser.add_argument("--use-policy", action="store_true", default=False,
                        help="Enable the learned Policy Head")
    parser.add_argument("--w-validity", type=float, default=getattr(config, "WEIGHT_VALIDITY", 1.0),
                        help="Weight for the sentence validity score component")
    parser.add_argument("--use-validity", action="store_true", default=False,
                        help="Enable the Sentence Validity Head")
    parser.add_argument("--use-validity-v2", action="store_true", default=False,
                        help="Enable Sentence Validity Head v2")
    parser.add_argument("--use-makes-sense-v2", action="store_true", default=False,
                        help="Enable Deep Makes-Sense v2 Trajectory Scorer")
    parser.add_argument("--use-makes-sense-v2-1", action="store_true", default=False,
                        help="Enable Deep Makes-Sense v2.1 Trajectory Scorer")
    parser.add_argument("--stitch-mode", type=str, default="sentence_preserving",
                        choices=["legacy", "sentence_preserving", "smart"],
                        help="Stitching mode for final text generation")

    # v5.5.3 — Repetition Control
    parser.add_argument("--no-repetition-penalty", action="store_true", default=False,
                        help="Disable the Multi-Level Repetition Penalty system entirely")
    parser.add_argument("--w-sentence-rep", type=float, default=getattr(config, "WEIGHT_SENTENCE_REP", 1.0),
                        help="Weight for sentence-level exact duplicate penalty")
    parser.add_argument("--w-semantic-rep", type=float, default=getattr(config, "WEIGHT_SEMANTIC_REP", 0.75),
                        help="Weight for semantic paraphrase repetition penalty")
    parser.add_argument("--w-topic-rep", type=float, default=getattr(config, "WEIGHT_TOPIC_REP", 1.25),
                        help="Weight for topic centroid repetition penalty")
    parser.add_argument("--w-topic-progress", type=float, default=getattr(config, "WEIGHT_TOPIC_PROGRESS", 0.5),
                        help="Weight for topic exploration progress bonus")

    parser.add_argument("--verbose", action="store_true",
                        help="Print step explanations and candidate scores")
    parser.add_argument("--output", type=str, default="quilted_output.txt",
                        help="Output path to save the quilted text")
    
    args = parser.parse_args()
    
    # 1. Initialization
    set_seed(config.SEED)
    log_info("Initializing AlphaLM v3 Language Engine...")
    
    # Override settings dynamically from CLI
    config.BOUNDARY_SIZE = args.boundary_size
    config.ALLOW_REUSE = args.allow_reuse
    
    # Build weights dict; zero-out repetition system if --no-repetition-penalty
    rep_scale = 0.0 if args.no_repetition_penalty else 1.0
    weights = {
        "boundary":      args.w_boundary,
        "local":         args.w_local,
        "global":        args.w_global,
        "completion":    0.0,
        "makes_sense":   args.w_makes_sense,
        "policy":        args.w_policy,
        "validity":      args.w_validity,
        "sentence_rep":  args.w_sentence_rep  * rep_scale,
        "semantic_rep":  args.w_semantic_rep  * rep_scale,
        "topic_rep":     args.w_topic_rep     * rep_scale,
        "topic_progress": args.w_topic_progress * rep_scale,
    }
    
    # 2. Load and preprocess corpus
    corpus_text = load_corpus(Path(args.corpus))
    sentences = split_into_sentences(corpus_text)
    log_info(f"Split corpus into {len(sentences)} sentences.")
    
    if len(sentences) == 0:
        log_info("Error: Corpus has no valid sentences. Exiting.")
        return
    
    # 3. Tokenize sentences
    log_info("Tokenizing sentences...")
    tokenized_corpus = [clean_and_tokenize(s) for s in sentences]
    
    # Filter out empty token lists
    valid_sentences = []
    valid_tokenized = []
    for s, tok in zip(sentences, tokenized_corpus):
        if tok:
            valid_sentences.append(s)
            valid_tokenized.append(tok)
            
    log_info(f"Retained {len(valid_sentences)} non-empty sentences.")
    
    # Load learned 'Makes-Sense' evaluator if enabled
    evaluator = None
    if args.use_makes_sense_v2_1 or args.use_makes_sense_v2 or args.use_evaluator or args.w_makes_sense > 0.0:
        if args.use_makes_sense_v2_1:
            log_info("Loading learned Deep 'Makes-Sense' evaluator v2.1...")
            from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
            evaluator = DeepMakesSenseEvaluatorV2_1()
        elif args.use_makes_sense_v2:
            log_info("Loading learned Deep 'Makes-Sense' evaluator v2...")
            from models.makes_sense_v2 import DeepMakesSenseEvaluatorV2
            evaluator = DeepMakesSenseEvaluatorV2()
        else:
            log_info("Loading learned 'Makes-Sense' evaluator v1...")
            from evaluator.infer import MakesSenseEvaluator
            evaluator = MakesSenseEvaluator()

    # Load learned Policy Head if enabled
    policy_head = None
    if args.use_policy or args.w_policy > 0.0:
        log_info("Loading learned Policy Head...")
        from policy.infer import AlphaLMPolicyHead
        policy_head = AlphaLMPolicyHead()

    # Load Sentence Validity evaluator if enabled
    validity_evaluator = None
    if args.use_validity_v2 or args.use_validity or args.w_validity > 0.0:
        if args.use_validity_v2:
            log_info("Loading Sentence Validity evaluator v2...")
            from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
            validity_evaluator = SentenceValidityEvaluatorV2()
        else:
            log_info("Loading Sentence Validity evaluator v1...")
            from models.sentence_validity import SentenceValidityEvaluator
            validity_evaluator = SentenceValidityEvaluator()

    # 4. Train/Load Word2Vec
    if evaluator is not None:
        log_info("Reusing pre-trained combined Word2Vec model from the evaluator for embedding space alignment...")
        w2v_model = evaluator.w2v
    elif policy_head is not None:
        log_info("Reusing pre-trained combined Word2Vec model from the policy head for embedding space alignment...")
        w2v_model = policy_head.w2v
    elif validity_evaluator is not None:
        log_info("Reusing pre-trained combined Word2Vec model from the validity evaluator for embedding space alignment...")
        w2v_model = validity_evaluator.w2v
    else:
        w2v_model = train_word2vec(valid_tokenized)
    
    # 5. Run Searcher
    searcher = AlphaLMSearcher(
        valid_sentences, 
        w2v_model, 
        makes_sense_evaluator=evaluator, 
        policy_head=policy_head,
        sentence_validity_evaluator=validity_evaluator
    )
    
    # Ensure seed index is within valid range
    seed_idx = args.seed_idx
    if seed_idx >= len(valid_sentences):
        log_info(f"Warning: Seed index {seed_idx} is out of bounds, resetting to 20.")
        seed_idx = 20
        
    log_info(f"Starting Beam Search (width: {args.beam_width})...")
    best_path, step_logs = searcher.search(
        seed_idx=seed_idx,
        num_sentences=args.num_sentences,
        beam_width=args.beam_width,
        weights=weights,
        stitch_mode=args.stitch_mode
    )
    
    # 6. Optional Verbose explanations
    if args.verbose:
        print("\n" + "=" * 50)
        print("DECISION EXPLANATION LOGS")
        print("=" * 50)
        for log in step_logs:
            exp_str = explain_decision(
                step=log["step"],
                selected_text=log["selected"]["text"],
                selected_idx=log["selected"]["index"],
                selected_scores=log["selected"],
                top_rejected=log["rejected"]
            )
            print(exp_str)
            
    # 7. Print Path Metrics Report
    report = generate_path_report(
        best_path.sentence_indices,
        best_path.local_scores,
        best_path.global_scores,
        best_path.match_scores,
        best_path.total_score,
        makes_sense_scores=best_path.makes_sense_scores,
        policy_scores=best_path.policy_scores,
        validity_scores=best_path.validity_scores
    )
    
    print("\n" + "=" * 60)
    print("PATH METRICS REPORT:")
    print(f"  Path Length:               {report['path_length']}")
    print(f"  Total Path Score:          {report['total_score']:.4f}")
    print(f"  Exact Boundary Matches:    {report['exact_boundary_matches']}")
    print(f"  Average Local Coherence:   {report['avg_local_coherence']:.4f}")
    print(f"  Average Global Coherence:  {report['avg_global_coherence']:.4f}")
    print(f"  Average Makes-Sense Score: {report['avg_makes_sense_score']:.4f}")
    print(f"  Average Policy Score:      {report['avg_policy_score']:.4f}")
    print(f"  Average Validity Score:    {report['avg_validity_score']:.4f}")
    print(f"  Global Coherence Trend:    {report['global_coherence_trend']:.6f}")
    print("=" * 60)
    
    # 8. Print and Save Quilted Output
    print("\nQUILTED OUTPUT:")
    print(best_path.generated_text)
    print("=" * 60)
    
    output_path = Path(args.output)
    output_path.write_text(best_path.generated_text, encoding="utf-8")
    log_info(f"Saved quilted text to: {output_path.resolve()}")

if __name__ == "__main__":
    main()

