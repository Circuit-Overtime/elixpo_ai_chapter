import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ---- styling ----
plt.rcParams["font.family"] = "DejaVu Sans"
C_IN   = "#dbeafe"   # input/output  (light blue)
C_PRE  = "#fef3c7"   # pre/post processing (amber)
C_CORE = "#fecaca"   # the transformer core (red) - what we zoom into
C_ATTN = "#bbf7d0"   # attention internals (green)
C_NORM = "#e9d5ff"   # norm/residual (purple)
EDGE   = "#334155"

def box(ax, x, y, w, h, text, color, fs=10.5, bold=False):
    p = FancyBboxPatch((x - w/2, y - h/2), w, h,
                       boxstyle="round,pad=0.02,rounding_size=0.08",
                       linewidth=1.4, edgecolor=EDGE, facecolor=color, zorder=2)
    ax.add_patch(p)
    ax.text(x, y, text, ha="center", va="center", fontsize=fs,
            fontweight="bold" if bold else "normal", zorder=3, color="#111827")

def arrow(ax, x1, y1, x2, y2, color=EDGE, style="-|>", lw=1.6, ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                 mutation_scale=14, lw=lw, color=color, linestyle=ls, zorder=1))

fig, (axA, axB, axC) = plt.subplots(1, 3, figsize=(19, 11))
for ax in (axA, axB, axC):
    ax.set_xlim(0, 10); ax.set_ylim(0, 22); ax.axis("off")

# =========================================================
# PANEL A : THE WHOLE LLM  (data flows top -> bottom)
# =========================================================
axA.set_title("A.  The whole LLM pipeline", fontsize=15, fontweight="bold", pad=12)
xc = 5
rows = [
    ('Input text\n"To be or not to b"',                C_IN,   1.4),
    ("Tokenizer\n(text -> token IDs)",                  C_PRE,  1.5),
    ("Token Embedding  +  Positional Encoding\n(IDs -> vectors, add 'where am I')", C_PRE, 1.8),
    ("Transformer Block  x N\n(the engine - see Panel B)", C_CORE, 1.9),
    ("Final LayerNorm",                                 C_NORM, 1.3),
    ("LM Head  (Linear -> vocab logits)\nvector -> one score per token", C_PRE, 1.8),
    ("Softmax\n(logits -> probabilities)",              C_PRE,  1.5),
    ('Sample next token  ->  "e"',                      C_IN,   1.4),
]
ys = [20.3, 17.9, 15.3, 12.4, 9.9, 7.6, 5.2, 3.0]
for (txt, col, h), y in zip(rows, ys):
    bold = "Transformer Block" in txt
    box(axA, xc, y, 7.4, h, txt, col, fs=10.2, bold=bold)
for i in range(len(ys) - 1):
    arrow(axA, xc, ys[i] - rows[i][2]/2, xc, ys[i+1] + rows[i+1][2]/2)
# loop-back arrow (autoregression)
arrow(axA, 9.3, 3.0, 9.3, 20.3, color="#2563eb", lw=1.3, ls=(0,(4,3)))
arrow(axA, 9.3, 20.3, xc+3.7, 20.3, color="#2563eb", lw=1.3, ls=(0,(4,3)))
axA.plot([xc+3.7, 9.3], [3.0, 3.0], color="#2563eb", lw=1.3, ls=(0,(4,3)))
axA.text(9.55, 11.6, "append token,\nfeed back in\n(autoregression)",
         rotation=90, va="center", ha="center", fontsize=8.5, color="#2563eb")

# =========================================================
# PANEL B : ONE TRANSFORMER BLOCK (zoom of the red box)
# =========================================================
axB.set_title("B.  Inside one Transformer Block", fontsize=15, fontweight="bold", pad=12)
xc = 4.2
b = [
    ("x  (vectors in)",                         C_IN,   1.2, 20.6),
    ("LayerNorm",                               C_NORM, 1.1, 18.6),
    ("Multi-Head\nSelf-Attention",              C_CORE, 1.9, 16.2),
    ("Add  (+ residual)",                       C_NORM, 1.1, 13.7),
    ("LayerNorm",                               C_NORM, 1.1, 11.6),
    ("Feed-Forward (MLP)\nLinear -> GELU -> Linear", C_CORE, 1.9, 9.0),
    ("Add  (+ residual)",                       C_NORM, 1.1, 6.5),
    ("output  (-> next block)",                 C_IN,   1.2, 4.5),
]
for txt, col, h, y in b:
    box(axB, xc, y, 5.6, h, txt, col, fs=10.2,
        bold=("Attention" in txt or "MLP" in txt))
for i in range(len(b) - 1):
    arrow(axB, xc, b[i][3]-b[i][2]/2, xc, b[i+1][3]+b[i+1][2]/2)

def skip(ax, y_from, y_to, label):
    x_hw = xc + 3.5
    arrow(ax, xc+0.1, y_from, x_hw, y_from, color="#16a34a", lw=1.4)
    ax.plot([x_hw, x_hw], [y_from, y_to], color="#16a34a", lw=1.4, zorder=1)
    arrow(ax, x_hw, y_to, xc+0.1, y_to, color="#16a34a", lw=1.4)
    ax.text(x_hw+0.15, (y_from+y_to)/2, label, rotation=90, va="center",
            ha="left", fontsize=8.3, color="#16a34a")

skip(axB, 20.0, 13.7, "skip / residual")
skip(axB, 13.1, 6.5, "skip / residual")
axB.text(xc, 1.9,
         "Residual stream = the 'highway';\neach sublayer reads it,\n"
         "computes an update, adds it back.",
         ha="center", fontsize=8.8, style="italic", color="#16a34a")

# =========================================================
# PANEL C : INSIDE ATTENTION (zoom of the red attention box)
# =========================================================
axC.set_title("C.  Inside Multi-Head Self-Attention",
              fontsize=15, fontweight="bold", pad=12)
box(axC, 5, 20.8, 6.5, 1.2, "x  (one vector per token)", C_IN, 10.2)
box(axC, 2.0, 18.3, 2.6, 1.3, "Q = xW_Q\n(query)",  C_ATTN, 9.5)
box(axC, 5.0, 18.3, 2.6, 1.3, "K = xW_K\n(key)",    C_ATTN, 9.5)
box(axC, 8.0, 18.3, 2.6, 1.3, "V = xW_V\n(value)",  C_ATTN, 9.5)
arrow(axC, 4.2, 20.2, 2.0, 19.0)
arrow(axC, 5.0, 20.2, 5.0, 19.0)
arrow(axC, 5.8, 20.2, 8.0, 19.0)

box(axC, 3.5, 15.6, 5.2, 1.4,
    "scores = Q Kᵀ / √d\n('how much does each\ntoken match each other')",
    C_ATTN, 9.3)
arrow(axC, 2.0, 17.65, 3.0, 16.3)
arrow(axC, 5.0, 17.65, 4.0, 16.3)

box(axC, 3.5, 13.0, 5.2, 1.2, "Causal mask\n(can't look at the future)",
    C_NORM, 9.3)
arrow(axC, 3.5, 14.9, 3.5, 13.6)

box(axC, 3.5, 10.6, 5.2, 1.3,
    "Softmax over rows\n-> attention weights\n(sum to 1)", C_ATTN, 9.3)
arrow(axC, 3.5, 12.4, 3.5, 11.25)

box(axC, 5.0, 7.9, 6.6, 1.4,
    "weighted sum:  weights · V\n('gather info from the\n"
    "tokens you attended to')", C_ATTN, 9.3)
arrow(axC, 3.5, 9.95, 4.3, 8.6)
arrow(axC, 8.0, 17.65, 7.2, 8.6)

box(axC, 5.0, 5.3, 6.6, 1.4, "concat heads -> W_O\n(mix heads, project out)",
    C_ATTN, 9.5)
arrow(axC, 5.0, 7.2, 5.0, 6.0)

box(axC, 5.0, 3.0, 6.6, 1.2, "attention output\n(-> Add & residual)", C_IN, 10.2)
arrow(axC, 5.0, 4.6, 5.0, 3.6)

axC.text(5.0, 1.3,
         "Each token asks (Q) what it's looking for,\n"
         "every token advertises (K) what it has,\n"
         "and carries (V) the payload to hand over.",
         ha="center", fontsize=8.8, style="italic", color="#166534")

# zoom indicators between panels
fig.text(0.345, 0.5, "ZOOM\n──▶", ha="center", va="center",
         fontsize=11, fontweight="bold", color=EDGE)
fig.text(0.675, 0.5, "ZOOM\n──▶", ha="center", va="center",
         fontsize=11, fontweight="bold", color=EDGE)

fig.suptitle(
    "Transformer architecture at three zoom levels  "
    "(decoder-only LLM, e.g. wozformer / GPT-style)",
    fontsize=16, fontweight="bold", y=0.985)
plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig("transformer_arch.png", dpi=130, bbox_inches="tight", facecolor="white")
print("saved transformer_arch.png")
