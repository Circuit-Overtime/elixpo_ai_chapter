"""
AlphaLM v5.5.3 — Repetition Analysis Visualization Page
=========================================================
Interactive Streamlit page for inspecting topic drift and repetition penalties
over a generated trajectory.

Displays:
  1. Generated trajectory text
  2. Topic similarity curve     (candidate ↔ topic memory per step)
  3. Semantic repetition curve  (max pairwise cosine similarity per step)
  4. Topic progress curve       (exploration bonus per step)
  5. Total repetition penalty curve

All charts use Plotly for interactivity.
"""

import sys
import numpy as np
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from embeddings import get_mean_vector
from scoring.repetition_semantic import cosine_similarity

st.set_page_config(
    page_title="AlphaLM — Repetition Analysis",
    page_icon="🔄",
    layout="wide"
)

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    * { font-family: 'Outfit', sans-serif; }
    .rep-banner {
        background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
        padding: 2rem 2.5rem;
        border-radius: 16px;
        text-align: center;
        margin-bottom: 2rem;
    }
    .rep-banner h1 { color: #fff !important; font-weight: 800; margin-bottom: 0.3rem; }
    .rep-banner p  { color: #94a3b8 !important; margin: 0; }
    .sent-card {
        background: #1e293b;
        border-left: 4px solid #38bdf8;
        border-radius: 8px;
        padding: 0.8rem 1.2rem;
        margin-bottom: 0.6rem;
        color: #f1f5f9;
        font-size: 0.95rem;
    }
    .sent-card.high-penalty {
        border-left-color: #f43f5e;
        background: #2d1220;
    }
    .sent-card.good-progress {
        border-left-color: #4ade80;
        background: #0d2b1a;
    }
    </style>
""", unsafe_allow_html=True)

st.markdown("""
    <div class="rep-banner">
        <h1>🔄 Repetition & Topic Drift Analysis</h1>
        <p>Inspect how AlphaLM v5.5.3's Multi-Level Repetition Control shapes topic progression in generated trajectories.</p>
    </div>
""", unsafe_allow_html=True)

# ── Sidebar ──────────────────────────────────────────────────────────────────
st.sidebar.title("Repetition Analysis Settings")

@st.cache_resource
def load_searcher():
    """Load full AlphaLM stack for the repetition analysis page."""
    from search import AlphaLMSearcher
    from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
    from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
    from policy.infer import AlphaLMPolicyHead

    corpus_text = load_corpus(config.CORPUS_PATH)
    sentences   = split_into_sentences(corpus_text)
    valid_sents = [s for s in sentences if clean_and_tokenize(s)]

    ms  = DeepMakesSenseEvaluatorV2_1()
    val = SentenceValidityEvaluatorV2()
    pol = AlphaLMPolicyHead()

    searcher = AlphaLMSearcher(
        corpus_sentences=valid_sents,
        w2v_model=ms.w2v,
        makes_sense_evaluator=ms,
        policy_head=pol,
        sentence_validity_evaluator=val,
    )
    return searcher, valid_sents

with st.spinner("Loading AlphaLM stack..."):
    try:
        searcher, valid_sents = load_searcher()
        st.sidebar.success(f"Loaded {len(valid_sents)} corpus sentences.")
    except Exception as e:
        st.error(f"Failed to load AlphaLM stack: {e}")
        st.stop()

seed_idx     = st.sidebar.number_input("Seed sentence index", min_value=0, max_value=len(valid_sents)-1, value=20, step=1)
num_sents    = st.sidebar.slider("Number of sentences", 3, 20, 8)
beam_width   = st.sidebar.slider("Beam width", 1, 8, 5)
stitch_mode  = st.sidebar.selectbox("Stitch mode", ["sentence_preserving", "smart", "legacy"])

st.sidebar.subheader("Repetition Weights")
w_sent_rep  = st.sidebar.slider("w_sentence_rep",  0.0, 3.0, 1.0,  0.05)
w_sem_rep   = st.sidebar.slider("w_semantic_rep",  0.0, 3.0, 0.75, 0.05)
w_topic_rep = st.sidebar.slider("w_topic_rep",     0.0, 3.0, 1.25, 0.05)
w_progress  = st.sidebar.slider("w_topic_progress",0.0, 3.0, 0.5,  0.05)

run_btn = st.sidebar.button("🚀 Run Analysis", use_container_width=True)

# ── Main content ─────────────────────────────────────────────────────────────
if run_btn:
    weights = {
        "boundary":      config.WEIGHT_BOUNDARY,
        "local":         config.WEIGHT_LOCAL,
        "global":        config.WEIGHT_GLOBAL,
        "completion":    0.0,
        "makes_sense":   config.WEIGHT_MAKES_SENSE,
        "policy":        config.WEIGHT_POLICY,
        "validity":      config.WEIGHT_VALIDITY,
        "sentence_rep":  w_sent_rep,
        "semantic_rep":  w_sem_rep,
        "topic_rep":     w_topic_rep,
        "topic_progress": w_progress,
    }

    with st.spinner("Running beam search with repetition control..."):
        best_path, step_logs = searcher.search(
            seed_idx=seed_idx,
            num_sentences=num_sents,
            beam_width=beam_width,
            weights=weights,
            stitch_mode=stitch_mode,
        )

    # ── 1. Generated Text ─────────────────────────────────────────────────
    st.subheader("📝 Generated Trajectory")
    st.markdown(f"> {best_path.generated_text}")
    st.markdown("---")

    # ── 2. Per-step signals ───────────────────────────────────────────────
    steps         = list(range(1, len(best_path.step_details) + 1))
    topic_reps    = [d.get("topic_rep",      0.0) for d in best_path.step_details]
    sem_reps      = [d.get("semantic_rep",   0.0) for d in best_path.step_details]
    progresses    = [d.get("topic_progress", 0.0) for d in best_path.step_details]
    rep_penalties = [d.get("repetition_penalty", 0.0) for d in best_path.step_details]
    texts         = [d.get("text", "")[:60] + "..." for d in best_path.step_details]

    # ── 3. Coloured sentence log ──────────────────────────────────────────
    st.subheader("🎨 Sentence-by-Sentence Repetition Log")
    header_cols = st.columns([4, 1, 1, 1, 1])
    header_cols[0].markdown("**Sentence**")
    header_cols[1].markdown("**Sent Rep**")
    header_cols[2].markdown("**Sem Rep**")
    header_cols[3].markdown("**Topic Rep**")
    header_cols[4].markdown("**Progress**")

    for i, d in enumerate(best_path.step_details):
        penalty = d.get("repetition_penalty", 0.0)
        prog    = d.get("topic_progress",     0.0)
        css_cls = "high-penalty" if penalty > 0.5 else ("good-progress" if prog > 0.6 else "")
        cols = st.columns([4, 1, 1, 1, 1])
        cols[0].markdown(f'<div class="sent-card {css_cls}">{d.get("text","")}</div>', unsafe_allow_html=True)
        cols[1].markdown(f"`{d.get('sentence_rep', 0.0):.2f}`")
        cols[2].markdown(f"`{d.get('semantic_rep', 0.0):.2f}`")
        cols[3].markdown(f"`{d.get('topic_rep', 0.0):.2f}`")
        cols[4].markdown(f"`{d.get('topic_progress', 0.0):.2f}`")

    st.markdown("---")

    # ── 4. Plotly charts ──────────────────────────────────────────────────
    st.subheader("📊 Trajectory Signal Curves")

    col_left, col_right = st.columns(2)

    with col_left:
        # Topic similarity curve
        fig_topic = go.Figure()
        fig_topic.add_trace(go.Scatter(
            x=steps, y=topic_reps, mode="lines+markers",
            line=dict(color="#f43f5e", width=2),
            marker=dict(size=8),
            text=texts, hovertemplate="Step %{x}<br>Topic Rep: %{y:.3f}<br>%{text}<extra></extra>",
            name="Topic Repetition"
        ))
        fig_topic.add_hline(y=0.0, line_dash="dot", line_color="#64748b", annotation_text="threshold 0.75 (active above)")
        fig_topic.update_layout(
            title="Topic Repetition Penalty per Step",
            xaxis_title="Step", yaxis_title="Topic Rep Score",
            template="plotly_dark", height=320,
            yaxis_range=[-0.05, 0.3]
        )
        st.plotly_chart(fig_topic, use_container_width=True)

        # Progress bonus curve
        fig_prog = go.Figure()
        fig_prog.add_trace(go.Scatter(
            x=steps, y=progresses, mode="lines+markers",
            line=dict(color="#4ade80", width=2),
            marker=dict(size=8),
            text=texts, hovertemplate="Step %{x}<br>Progress: %{y:.3f}<br>%{text}<extra></extra>",
            name="Topic Progress"
        ))
        fig_prog.update_layout(
            title="Topic Progress Bonus per Step",
            xaxis_title="Step", yaxis_title="Progress Bonus",
            template="plotly_dark", height=320,
            yaxis_range=[-0.05, 1.05]
        )
        st.plotly_chart(fig_prog, use_container_width=True)

    with col_right:
        # Semantic repetition curve
        fig_sem = go.Figure()
        fig_sem.add_trace(go.Scatter(
            x=steps, y=sem_reps, mode="lines+markers",
            line=dict(color="#f59e0b", width=2),
            marker=dict(size=8),
            text=texts, hovertemplate="Step %{x}<br>Sem Rep: %{y:.3f}<br>%{text}<extra></extra>",
            name="Semantic Repetition"
        ))
        fig_sem.update_layout(
            title="Semantic Repetition Penalty per Step",
            xaxis_title="Step", yaxis_title="Semantic Rep Score",
            template="plotly_dark", height=320,
            yaxis_range=[-0.05, 0.2]
        )
        st.plotly_chart(fig_sem, use_container_width=True)

        # Total penalty curve
        fig_pen = go.Figure()
        fig_pen.add_trace(go.Bar(
            x=steps, y=rep_penalties,
            marker_color=["#f43f5e" if p > 0 else "#4ade80" for p in rep_penalties],
            text=[f"{p:.3f}" for p in rep_penalties],
            textposition="outside",
            hovertemplate="Step %{x}<br>Total Penalty: %{y:.3f}<extra></extra>",
        ))
        fig_pen.add_hline(y=0, line_color="#64748b", line_dash="dot")
        fig_pen.update_layout(
            title="Total Repetition Penalty per Step",
            xaxis_title="Step", yaxis_title="Net Penalty (neg = bonus dominates)",
            template="plotly_dark", height=320,
        )
        st.plotly_chart(fig_pen, use_container_width=True)

    st.markdown("---")
    st.subheader("📋 Raw Step Details")
    import pandas as pd
    rows = []
    for i, d in enumerate(best_path.step_details):
        rows.append({
            "Step":         i + 1,
            "Sentence":     d.get("text", "")[:80],
            "Sent Rep":     round(d.get("sentence_rep",    0.0), 4),
            "Sem Rep":      round(d.get("semantic_rep",    0.0), 4),
            "Topic Rep":    round(d.get("topic_rep",       0.0), 4),
            "Progress":     round(d.get("topic_progress",  0.0), 4),
            "Net Penalty":  round(d.get("repetition_penalty", 0.0), 4),
            "Total Score":  round(d.get("total_score",     0.0), 4),
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True)

else:
    st.info("👈 Configure settings in the sidebar and click **Run Analysis** to inspect topic drift.")
