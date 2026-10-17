import streamlit as st
from pathlib import Path
import config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from embeddings import train_word2vec
from search import AlphaLMSearcher
from metrics import generate_path_report
import pandas as pd

# Page Configuration
st.set_page_config(
    page_title="AlphaLM v5.5 - Trajectory Search Dashboard",
    page_icon="🕸️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Glassmorphism & Cyber-Gradient theme)
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Space+Grotesk:wght@400;500;700&display=swap');
    
    * {
        font-family: 'Outfit', sans-serif;
    }
    
    .main-title-banner {
        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
        padding: 2.5rem;
        border-radius: 16px;
        text-align: center;
        margin-bottom: 2rem;
        box-shadow: 0 10px 20px rgba(0,0,0,0.1);
    }
    
    .main-title-banner h1 {
        color: #FFFFFF !important;
        font-weight: 800;
        letter-spacing: -1px;
        margin-bottom: 0.5rem;
    }
    
    .main-title-banner p {
        color: #E2E8F0 !important;
        font-size: 1.1rem;
        font-weight: 300;
        margin-bottom: 0;
    }
    
    .glass-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.08);
    }
    
    .output-box-greedy {
        background: #1F2937;
        color: #F9FAFB;
        border-left: 5px solid #F59E0B;
        padding: 1.5rem;
        border-radius: 8px;
        font-size: 1.1rem;
        line-height: 1.6;
        min-height: 200px;
    }
    
    .output-box-beam {
        background: #111827;
        color: #F9FAFB;
        border-left: 5px solid #10B981;
        padding: 1.5rem;
        border-radius: 8px;
        font-size: 1.15rem;
        line-height: 1.6;
        min-height: 200px;
    }
    </style>
    """, unsafe_allow_html=True)

# ----------------------------------------------------
# Caching Functions to Optimize Streamlit Re-Runs
# ----------------------------------------------------
@st.cache_data
def get_sentences_and_tokens(corpus_text: str):
    sentences = split_into_sentences(corpus_text)
    tokenized = [clean_and_tokenize(s) for s in sentences]
    
    valid_sentences = []
    valid_tokenized = []
    for s, tok in zip(sentences, tokenized):
        if tok:
            valid_sentences.append(s)
            valid_tokenized.append(tok)
    return valid_sentences, valid_tokenized

@st.cache_resource
def get_trained_model(tokenized_sentences):
    return train_word2vec(tokenized_sentences)

@st.cache_resource
def load_makes_sense_v2_1(is_tinystories: bool = False):
    try:
        from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
        if is_tinystories:
            w2v_path = config.BASE_DIR / "models" / "tinystories_word2vec.model"
            model_path = config.BASE_DIR / "models" / "makes_sense_tinystories.pt"
            return DeepMakesSenseEvaluatorV2_1(model_path=model_path, w2v_path=w2v_path)
        return DeepMakesSenseEvaluatorV2_1()
    except Exception as e:
        st.sidebar.error(f"Error loading Deep Makes-Sense v2.1: {e}")
        return None

@st.cache_resource
def load_makes_sense_v2(is_tinystories: bool = False):
    try:
        from models.makes_sense_v2 import DeepMakesSenseEvaluatorV2
        if is_tinystories:
            st.sidebar.warning("Deep Makes-Sense v2 is not supported for TinyStories. Falling back to v2.1.")
            return load_makes_sense_v2_1(is_tinystories=True)
        return DeepMakesSenseEvaluatorV2()
    except Exception as e:
        st.sidebar.error(f"Error loading Deep Makes-Sense v2: {e}")
        return None

@st.cache_resource
def load_policy_head(is_tinystories: bool = False):
    try:
        from policy.infer import AlphaLMPolicyHead
        if is_tinystories:
            w2v_path = config.BASE_DIR / "models" / "tinystories_word2vec.model"
            model_path = config.BASE_DIR / "models" / "policy_tinystories.pt"
            return AlphaLMPolicyHead(model_path=model_path, w2v_path=w2v_path)
        return AlphaLMPolicyHead()
    except Exception as e:
        st.sidebar.error(f"Error loading Policy Head: {e}")
        return None

@st.cache_resource
def load_validity_evaluator_v2(is_tinystories: bool = False):
    try:
        from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
        if is_tinystories:
            w2v_path = config.BASE_DIR / "models" / "tinystories_word2vec.model"
            model_path = config.BASE_DIR / "models" / "validity_tinystories.pt"
            corpus_path = config.BASE_DIR / "tinystories_1m.txt"
            return SentenceValidityEvaluatorV2(model_path=model_path, w2v_path=w2v_path, corpus_path=corpus_path)
        return SentenceValidityEvaluatorV2()
    except Exception as e:
        st.sidebar.error(f"Error loading Sentence Validity v2: {e}")
        return None

@st.cache_resource
def load_validity_evaluator(is_tinystories: bool = False):
    try:
        from models.sentence_validity import SentenceValidityEvaluator
        if is_tinystories:
            st.sidebar.warning("Sentence Validity v1 is not supported for TinyStories. Falling back to v2.")
            return load_validity_evaluator_v2(is_tinystories=True)
        return SentenceValidityEvaluator()
    except Exception as e:
        st.sidebar.error(f"Error loading Sentence Validity: {e}")
        return None

@st.cache_resource
def load_makes_sense_transformer(is_tinystories: bool = False):
    try:
        from models.makes_sense_transformer import DeepMakesSenseEvaluatorTransformer
        w2v_path = config.BASE_DIR / "models" / "tinystories_word2vec.model" if is_tinystories else config.BASE_DIR / "evaluator" / "evaluator_w2v.model"
        model_path = config.BASE_DIR / "models" / "makes_sense_tinystories_transformer.pt"
        return DeepMakesSenseEvaluatorTransformer(model_path=model_path, w2v_path=w2v_path)
    except Exception as e:
        st.sidebar.error(f"Error loading Makes-Sense Transformer: {e}")
        return None

@st.cache_resource
def load_validity_evaluator_transformer(is_tinystories: bool = False):
    try:
        from models.sentence_validity_transformer import SentenceValidityEvaluatorTransformer
        w2v_path = config.BASE_DIR / "models" / "tinystories_word2vec.model" if is_tinystories else config.BASE_DIR / "evaluator" / "evaluator_w2v.model"
        model_path = config.BASE_DIR / "models" / "validity_tinystories_transformer.pt"
        corpus_path = config.BASE_DIR / "tinystories_1m.txt" if is_tinystories else None
        return SentenceValidityEvaluatorTransformer(model_path=model_path, w2v_path=w2v_path, corpus_path=corpus_path)
    except Exception as e:
        st.sidebar.error(f"Error loading Sentence Validity Transformer: {e}")
        return None

# ----------------------------------------------------
# Sidebar Controls
# ----------------------------------------------------
st.sidebar.image("https://img.icons8.com/nolan/96/artificial-intelligence.png", width=80)
st.sidebar.title("AlphaLM v5.5 Settings")

# Corpus loading
st.sidebar.subheader("1. Source Text Corpus")
corpus_source = st.sidebar.radio(
    "Select Corpus Source", 
    ["Default (sales_dataset.txt)", "TinyStories (tinystories_1m.txt)", "Paste text manually"]
)

corpus_text = ""
is_tinystories = False
if corpus_source == "Default (sales_dataset.txt)":
    default_path = config.CORPUS_PATH
    if default_path.exists():
        try:
            with open(default_path, "r", encoding="utf-8", errors="ignore") as f:
                corpus_text = f.read()
            st.sidebar.success("Loaded default dataset successfully!")
        except Exception as e:
            st.sidebar.error(f"Error loading default corpus: {e}")
    else:
        st.sidebar.warning(f"Default file {default_path.name} not found. Please paste text instead.")
        corpus_source = "Paste text manually"

elif corpus_source == "TinyStories (tinystories_1m.txt)":
    ts_path = config.BASE_DIR / "tinystories_1m.txt"
    if ts_path.exists():
        try:
            with open(ts_path, "r", encoding="utf-8", errors="ignore") as f:
                corpus_text = f.read()
            is_tinystories = True
            st.sidebar.success("Loaded TinyStories dataset successfully!")
        except Exception as e:
            st.sidebar.error(f"Error loading TinyStories corpus: {e}")
    else:
        st.sidebar.warning("TinyStories file (tinystories_1m.txt) not found. Please paste text instead.")
        corpus_source = "Paste text manually"

if corpus_source == "Paste text manually":
    corpus_text = st.sidebar.text_area("Paste Corpus Text Here", height=200, placeholder="Once upon a time...")

# Generation parameters
st.sidebar.subheader("2. Search Parameters")
num_sentences = st.sidebar.slider("Number of sentences to generate", 3, 20, config.DEFAULT_NUM_SENTENCES)
beam_width = st.sidebar.slider("Beam Search Width (B)", 2, 8, config.DEFAULT_BEAM_WIDTH)
boundary_size = st.sidebar.slider("Boundary word match size", 1, 4, config.BOUNDARY_SIZE)
allow_reuse = st.sidebar.checkbox("Allow sentence reuse", value=config.ALLOW_REUSE)
stitch_mode = st.sidebar.selectbox("Text Stitching Mode", ["sentence_preserving", "legacy", "smart"], index=0)

# Enable/Disable learned models
st.sidebar.subheader("3. Neural Evaluators")
use_makes_sense_tr = st.sidebar.checkbox("Enable Makes-Sense Transformer (v6)", value=True)
use_makes_sense_v2_1 = st.sidebar.checkbox("Enable Deep Makes-Sense v2.1", value=False)
use_makes_sense_v2 = st.sidebar.checkbox("Enable Deep Makes-Sense v2", value=False)
use_policy = st.sidebar.checkbox("Enable Policy Head Pruning", value=True)
use_validity_tr = st.sidebar.checkbox("Enable Sentence Validity Transformer (v6)", value=True)
use_validity_v2 = st.sidebar.checkbox("Enable Sentence Validity Head v2", value=False)
use_validity = st.sidebar.checkbox("Enable Sentence Validity Head v1", value=False)

# Scorer weights
st.sidebar.subheader("4. Component Weights")
w_boundary = st.sidebar.slider("Boundary Matching Weight", 0.0, 5.0, config.WEIGHT_BOUNDARY, 0.1)
w_local = st.sidebar.slider("Local Coherence Weight", 0.0, 5.0, config.WEIGHT_LOCAL, 0.1)
w_global = st.sidebar.slider("Global Coherence Weight", 0.0, 5.0, config.WEIGHT_GLOBAL, 0.1)

w_makes_sense = 0.0
if use_makes_sense_tr or use_makes_sense_v2_1 or use_makes_sense_v2:
    w_makes_sense = st.sidebar.slider("Deep Makes-Sense Weight", 0.0, 5.0, config.WEIGHT_MAKES_SENSE, 0.1)

w_policy = 0.0
if use_policy:
    w_policy = st.sidebar.slider("Policy Head Weight", 0.0, 5.0, config.WEIGHT_POLICY, 0.1)

w_validity = 0.0
if use_validity_tr or use_validity_v2 or use_validity:
    w_validity = st.sidebar.slider("Sentence Validity Weight", 0.0, 5.0, config.WEIGHT_VALIDITY, 0.1)

# v5.5.3 Repetition Control
st.sidebar.subheader("5. Repetition Control (v5.5.3)")
use_repetition = st.sidebar.checkbox("Enable Repetition Penalty", value=True)
w_sentence_rep  = st.sidebar.slider("Sentence Rep Weight",  0.0, 5.0, getattr(config, "WEIGHT_SENTENCE_REP",   1.0),  0.05) if use_repetition else 0.0
w_semantic_rep  = st.sidebar.slider("Semantic Rep Weight",  0.0, 5.0, getattr(config, "WEIGHT_SEMANTIC_REP",   0.25), 0.05) if use_repetition else 0.0
w_topic_rep     = st.sidebar.slider("Topic Rep Weight",     0.0, 5.0, getattr(config, "WEIGHT_TOPIC_REP",      2.25), 0.05) if use_repetition else 0.0
w_topic_progress= st.sidebar.slider("Topic Progress Weight",0.0, 5.0, getattr(config, "WEIGHT_TOPIC_PROGRESS", 0.5),  0.05) if use_repetition else 0.0

# Apply config globally
config.BOUNDARY_SIZE = boundary_size
config.ALLOW_REUSE = allow_reuse

# ----------------------------------------------------
# Main Dashboard UI
# ----------------------------------------------------
st.markdown("""
    <div class="main-title-banner">
        <h1>🕸️ AlphaLM v6 Trajectory Search System</h1>
        <p>Analyzing language generation trajectories: comparing Greedy path extensions vs. Neural-guided Beam Search.</p>
    </div>
    """, unsafe_allow_html=True)

if not corpus_text.strip():
    st.warning("Please paste or verify the source text corpus in the sidebar to start.")
else:
    # Processing Corpus
    valid_sentences, valid_tokenized = get_sentences_and_tokens(corpus_text)
    
    if not valid_sentences:
        st.error("Corpus does not contain any valid sentences.")
    else:
        # Load active models
        if use_makes_sense_tr:
            evaluator = load_makes_sense_transformer(is_tinystories=is_tinystories)
        elif use_makes_sense_v2_1:
            evaluator = load_makes_sense_v2_1(is_tinystories=is_tinystories)
        elif use_makes_sense_v2:
            evaluator = load_makes_sense_v2(is_tinystories=is_tinystories)
        else:
            evaluator = None
            
        policy_head = load_policy_head(is_tinystories=is_tinystories) if use_policy else None
        
        if use_validity_tr:
            validity_evaluator = load_validity_evaluator_transformer(is_tinystories=is_tinystories)
        elif use_validity_v2:
            validity_evaluator = load_validity_evaluator_v2(is_tinystories=is_tinystories)
        elif use_validity:
            validity_evaluator = load_validity_evaluator(is_tinystories=is_tinystories)
        else:
            validity_evaluator = None
        
        # Determine Word2Vec embedding alignment
        if evaluator is not None:
            w2v_model = evaluator.w2v
        elif policy_head is not None:
            w2v_model = policy_head.w2v
        elif validity_evaluator is not None:
            w2v_model = validity_evaluator.w2v
        else:
            if is_tinystories:
                from gensim.models import Word2Vec
                w2v_model = Word2Vec.load(str(config.BASE_DIR / "models" / "tinystories_word2vec.model"))
            else:
                w2v_model = get_trained_model(valid_tokenized)
            
        searcher = AlphaLMSearcher(
            valid_sentences, 
            w2v_model,
            makes_sense_evaluator=evaluator,
            policy_head=policy_head,
            sentence_validity_evaluator=validity_evaluator
        )
        
        st.subheader("Interactive Parameters")
        col_seed, col_action = st.columns([4, 1])
        
        with col_seed:
            seed_sentence = st.selectbox(
                "Select Starting (Seed) Sentence",
                options=range(len(valid_sentences)),
                format_func=lambda idx: f"[{idx}] {valid_sentences[idx][:120]}..."
            )
            
        with col_action:
            st.write("")
            st.write("")
            run_btn = st.button("🚀 Run Comparative Search", use_container_width=True)
            
        if run_btn:
            weights = {
                "boundary":       w_boundary,
                "local":          w_local,
                "global":         w_global,
                "completion":     0.0,
                "makes_sense":    w_makes_sense,
                "policy":         w_policy,
                "validity":       w_validity,
                "sentence_rep":   w_sentence_rep,
                "semantic_rep":   w_semantic_rep,
                "topic_rep":      w_topic_rep,
                "topic_progress": w_topic_progress,
            }
            
            with st.spinner("Analyzing candidate futures (running comparisons)..."):
                # Run Greedy (Beam width = 1)
                greedy_path, greedy_logs = searcher.search(
                    seed_idx=seed_sentence,
                    num_sentences=num_sentences,
                    beam_width=1,
                    weights=weights,
                    stitch_mode=stitch_mode
                )
                
                # Run Beam Search (Beam width = user input)
                beam_path, beam_logs = searcher.search(
                    seed_idx=seed_sentence,
                    num_sentences=num_sentences,
                    beam_width=beam_width,
                    weights=weights,
                    stitch_mode=stitch_mode
                )
                
                # Compute Metrics
                greedy_report = generate_path_report(
                    greedy_path.sentence_indices,
                    greedy_path.local_scores,
                    greedy_path.global_scores,
                    greedy_path.match_scores,
                    greedy_path.total_score,
                    makes_sense_scores=greedy_path.makes_sense_scores,
                    policy_scores=greedy_path.policy_scores,
                    validity_scores=greedy_path.validity_scores
                )
                
                beam_report = generate_path_report(
                    beam_path.sentence_indices,
                    beam_path.local_scores,
                    beam_path.global_scores,
                    beam_path.match_scores,
                    beam_path.total_score,
                    makes_sense_scores=beam_path.makes_sense_scores,
                    policy_scores=beam_path.policy_scores,
                    validity_scores=beam_path.validity_scores
                )
                
            # --- Results Comparison Side-by-Side ---
            st.subheader("Comparative Text Generation Results")
            col_g_text, col_b_text = st.columns(2)
            
            with col_g_text:
                st.markdown("### ⚠️ Greedy Generation (B = 1)")
                st.markdown(f'<div class="output-box-greedy">{greedy_path.generated_text}</div>', unsafe_allow_html=True)
                st.write("**Sequence:**", " ➔ ".join([f"[{i}]" for i in greedy_path.sentence_indices]))
                
            with col_b_text:
                st.markdown(f"### ❇️ Trajectory Search (B = {beam_width})")
                st.markdown(f'<div class="output-box-beam">{beam_path.generated_text}</div>', unsafe_allow_html=True)
                st.write("**Sequence:**", " ➔ ".join([f"[{i}]" for i in beam_path.sentence_indices]))
                
            # Path metrics comparison
            st.subheader("Trajectory Metrics Analysis")
            col_g_metrics, col_b_metrics = st.columns(2)
            
            with col_g_metrics:
                st.write("**Greedy Metrics:**")
                st.metric("Total Score", f"{greedy_report['total_score']:.4f}")
                st.metric("Avg Local Coherence", f"{greedy_report['avg_local_coherence']:.4f}")
                st.metric("Avg Global Coherence", f"{greedy_report['avg_global_coherence']:.4f}")
                if use_makes_sense_v2_1:
                    st.metric("Avg Deep Makes-Sense v2.1", f"{greedy_report.get('avg_makes_sense_score', 0.0):.4f}")
                elif use_makes_sense_v2:
                    st.metric("Avg Deep Makes-Sense v2", f"{greedy_report.get('avg_makes_sense_score', 0.0):.4f}")
                if use_policy:
                    st.metric("Avg Policy Score", f"{greedy_report.get('avg_policy_score', 0.0):.4f}")
                if use_validity_v2:
                    st.metric("Avg Sentence Validity v2", f"{greedy_report.get('avg_validity_score', 0.0):.4f}")
                elif use_validity:
                    st.metric("Avg Sentence Validity v1", f"{greedy_report.get('avg_validity_score', 0.0):.4f}")
                st.metric("Global Coherence Trend", f"{greedy_report['global_coherence_trend']:.6f}")
                st.metric("Exact Boundary Matches", greedy_report['exact_boundary_matches'])
                
            with col_b_metrics:
                st.write("**Beam Search Metrics:**")
                st.metric(
                    "Total Score", 
                    f"{beam_report['total_score']:.4f}", 
                    delta=f"{beam_report['total_score'] - greedy_report['total_score']:.4f}"
                )
                st.metric(
                    "Avg Local Coherence", 
                    f"{beam_report['avg_local_coherence']:.4f}",
                    delta=f"{beam_report['avg_local_coherence'] - greedy_report['avg_local_coherence']:.4f}"
                )
                st.metric(
                    "Avg Global Coherence", 
                    f"{beam_report['avg_global_coherence']:.4f}",
                    delta=f"{beam_report['avg_global_coherence'] - greedy_report['avg_global_coherence']:.4f}"
                )
                if use_makes_sense_v2_1:
                    st.metric(
                        "Avg Deep Makes-Sense v2.1",
                        f"{beam_report.get('avg_makes_sense_score', 0.0):.4f}",
                        delta=f"{beam_report.get('avg_makes_sense_score', 0.0) - greedy_report.get('avg_makes_sense_score', 0.0):.4f}"
                    )
                elif use_makes_sense_v2:
                    st.metric(
                        "Avg Deep Makes-Sense v2",
                        f"{beam_report.get('avg_makes_sense_score', 0.0):.4f}",
                        delta=f"{beam_report.get('avg_makes_sense_score', 0.0) - greedy_report.get('avg_makes_sense_score', 0.0):.4f}"
                    )
                if use_policy:
                    st.metric(
                        "Avg Policy Score",
                        f"{beam_report.get('avg_policy_score', 0.0):.4f}",
                        delta=f"{beam_report.get('avg_policy_score', 0.0) - greedy_report.get('avg_policy_score', 0.0):.4f}"
                    )
                if use_validity_v2:
                    st.metric(
                        "Avg Sentence Validity v2",
                        f"{beam_report.get('avg_validity_score', 0.0):.4f}",
                        delta=f"{beam_report.get('avg_validity_score', 0.0) - greedy_report.get('avg_validity_score', 0.0):.4f}"
                    )
                elif use_validity:
                    st.metric(
                        "Avg Sentence Validity v1",
                        f"{beam_report.get('avg_validity_score', 0.0):.4f}",
                        delta=f"{beam_report.get('avg_validity_score', 0.0) - greedy_report.get('avg_validity_score', 0.0):.4f}"
                    )
                st.metric(
                    "Global Coherence Trend", 
                    f"{beam_report['global_coherence_trend']:.6f}",
                    delta=f"{beam_report['global_coherence_trend'] - greedy_report['global_coherence_trend']:.6f}"
                )
                st.metric(
                    "Exact Boundary Matches", 
                    beam_report['exact_boundary_matches'],
                    delta=int(beam_report['exact_boundary_matches'] - greedy_report['exact_boundary_matches'])
                )
                
            # Step by Step Rankings Visualisation (For Beam Search)
            st.subheader("Beam Step Candidate Rankings & Decision Log")
            st.write("Examine candidate expansion tables for each generation step:")
            
            for step_idx, log in enumerate(beam_logs):
                step_num = log["step"]
                selected = log["selected"]
                rejected = log["rejected"]
                
                with st.expander(f"Generation Step {step_num}: Selected index {selected['index']} (Score: {selected['total_score']:.4f})"):
                    exact_m = selected["exact_match"]
                    sem_s = selected["semantic_similarity"]
                    
                    if exact_m > 0:
                        reason = f"Exact boundary match of length {exact_m}."
                    elif sem_s > 0.8:
                        reason = f"Strong semantic boundary continuation ({sem_s:.4f})."
                    else:
                        reason = f"Best semantic continuation match ({sem_s:.4f}) relative to other candidates."
                        
                    st.info(f"**Rationale:** {reason}  \n**Chosen sentence text:** \"{selected['text']}\"")
                    
                    # Score tables
                    rows = []
                    for i, item in enumerate([selected] + rejected):
                        row_data = {
                            "Status": "✅ Selected" if i == 0 else f"❌ Alternative {i}",
                            "Index": item["index"],
                            "Candidate Text": item["text"][:80] + "...",
                            "Boundary Match": f"{item['exact_match']} (exact)" if item['exact_match'] > 0 else f"{item['semantic_similarity']:.4f} (semantic)",
                            "Local Coherence": f"{item['local_coherence']:.4f}",
                            "Global Coherence": f"{item['global_coherence']:.4f}",
                        }
                        if use_makes_sense_v2_1:
                            row_data["Deep Makes-Sense v2.1"] = f"{item.get('makes_sense_score', 0.0):.4f}"
                        elif use_makes_sense_v2:
                            row_data["Deep Makes-Sense v2"] = f"{item.get('makes_sense_score', 0.0):.4f}"
                        if use_policy:
                            row_data["Policy Head"] = f"{item.get('policy_score', 0.0):.4f}"
                        if use_validity_v2:
                            row_data["Validity Head v2"] = f"{item.get('validity_score', 0.0):.4f}"
                        elif use_validity:
                            row_data["Validity Head v1"] = f"{item.get('validity_score', 0.0):.4f}"
                        if use_repetition:
                            row_data["Sent Rep"]   = f"{item.get('sentence_rep',    0.0):.4f}"
                            row_data["Sem Rep"]    = f"{item.get('semantic_rep',    0.0):.4f}"
                            row_data["Topic Rep"]  = f"{item.get('topic_rep',       0.0):.4f}"
                            row_data["Progress"]   = f"{item.get('topic_progress',  0.0):.4f}"
                            row_data["Net Penalty"]= f"{item.get('repetition_penalty', 0.0):.4f}"
                        row_data["Total Score"] = f"{item['total_score']:.4f}"
                        rows.append(row_data)
                        
                    st.table(pd.DataFrame(rows))
