"""BPE tokenizer extracted from notebooks 06b/07b/08/09/10/11/12/12c.

Single source of truth. Trained once per corpus, reused everywhere via the
on-disk cache (`.bpe.json`).
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import List, Tuple

from .utils import log_info

EOW = "</w>"   # end-of-word marker that prevents merges from crossing word boundaries


class BPETokenizer:
    """Whitespace-split BPE with end-of-word markers and bounded vocab.

    Usage:
        tok = BPETokenizer.train(text, vocab_size=256, num_merges=215)
        ids = tok.encode("the king")          # list[int]
        s   = tok.decode(ids)                 # "the king"
        tok.save("bpe_256.json")
        tok = BPETokenizer.load("bpe_256.json")
    """

    def __init__(
        self,
        itos: List[str],
        merges: List[Tuple[Tuple[str, str], str]],
    ) -> None:
        self.itos = itos
        self.stoi = {tok: i for i, tok in enumerate(itos)}
        self.merges = merges
        self.vocab_size = len(itos)
        self.unk_id = 0

    # ---------------------------------------------------------------- training
    @classmethod
    def train(
        cls,
        text: str,
        vocab_size: int = 256,
        num_merges: int | None = None,
    ) -> "BPETokenizer":
        """Train BPE on `text`. If num_merges is None, computed to land at vocab_size."""
        # Word-level frequency table where each word is a tuple of single chars + EOW
        word_freq = Counter(tuple(list(w) + [EOW]) for w in text.split())
        word_lists = {w: list(w) for w in word_freq}

        merges: List[Tuple[Tuple[str, str], str]] = []
        # If num_merges isn't given, run enough merges to hit ~vocab_size
        n_iters = num_merges if num_merges is not None else vocab_size * 3
        for step in range(n_iters):
            pair_counts: Counter = Counter()
            for w, freq in word_freq.items():
                symbols = word_lists[w]
                for i in range(len(symbols) - 1):
                    pair_counts[(symbols[i], symbols[i + 1])] += freq
            if not pair_counts:
                break
            best, _ = pair_counts.most_common(1)[0]
            new_tok = best[0] + best[1]
            merges.append((best, new_tok))

            for w in word_freq:
                sym = word_lists[w]
                new_sym: List[str] = []
                i = 0
                while i < len(sym):
                    if i < len(sym) - 1 and (sym[i], sym[i + 1]) == best:
                        new_sym.append(new_tok)
                        i += 2
                    else:
                        new_sym.append(sym[i])
                        i += 1
                word_lists[w] = new_sym

            # Check if we've hit vocab_size yet
            vocab_set = set()
            for w in word_freq:
                vocab_set.update(word_lists[w])
                vocab_set.update(w)
            if num_merges is None and len(vocab_set) >= vocab_size - 1:
                break

        # Final vocab: <unk> at id 0, then sorted unique pieces, padded if short
        vocab_set = set()
        for w in word_freq:
            vocab_set.update(word_lists[w])
            vocab_set.update(w)
        itos = ["<unk>"] + sorted(vocab_set)
        while len(itos) < vocab_size:
            itos.append(f"<pad{len(itos)}>")
        itos = itos[:vocab_size]

        log_info(f"BPE trained: {len(merges)} merges, vocab={len(itos)}")
        return cls(itos=itos, merges=merges)

    # ------------------------------------------------------------ encode/decode
    def encode_word(self, word: str) -> List[int]:
        sym = list(word) + [EOW]
        for (a, b), merged in self.merges:
            i = 0
            new_sym: List[str] = []
            while i < len(sym):
                if i < len(sym) - 1 and sym[i] == a and sym[i + 1] == b:
                    new_sym.append(merged)
                    i += 2
                else:
                    new_sym.append(sym[i])
                    i += 1
            sym = new_sym
        return [self.stoi.get(s, self.unk_id) for s in sym]

    def encode(self, text: str) -> List[int]:
        """Tokenize a multi-word string into BPE token IDs."""
        out: List[int] = []
        for w in text.split():
            out.extend(self.encode_word(w))
        return out

    def decode(self, ids: List[int]) -> str:
        """Inverse of encode (modulo padding/unk)."""
        return "".join(self.itos[i] for i in ids).replace(EOW, " ").rstrip()

    # ---------------------------------------------------------------- persistence
    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(
                {
                    "itos": self.itos,
                    "merges": [(list(p), m) for p, m in self.merges],
                },
                indent=1,
            )
        )

    @classmethod
    def load(cls, path: str | Path) -> "BPETokenizer":
        data = json.loads(Path(path).read_text())
        merges = [(tuple(p), m) for p, m in data["merges"]]
        return cls(itos=data["itos"], merges=merges)
