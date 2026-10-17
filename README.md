# Wozformer

*A transformer that runs on a 1 MHz 6502 — because Woz would have.*

Wozformer is a tiny attention-based language model, trained from scratch in PyTorch and ported to run on real vintage silicon: a Rockwell 6502 CPU with 8 KB of SRAM and 8 KB of EEPROM. An Arduino acts purely as an I/O coprocessor (clock source, EEPROM programmer, and mailbox to a 16x2 LCD and USB serial). **All inference math happens on the 6502.**

The point of this project is not to build a useful chatbot. The point is to understand transformers end-to-end by being forced to implement every operation — embedding lookup, QKᵀ, softmax, weighted sum, layer norm, the LM head — in 8-bit assembly on a chip from 1975.

## Hardware

| Part | Role |
|---|---|
| R6502P21 | CPU, ~1 MHz, runs all model inference |
| HY62CT08 (8 KB SRAM) | Activations, KV cache, stack, working memory |
| AT28C64 (8 KB EEPROM) | Model weights (int8), tokenizer table, program code, reset vector |
| Arduino | EEPROM programmer, clock source, I/O mailbox to LCD + USB serial |
| 16x2 I2C LCD | Output display (driven by Arduino, not the 6502 directly) |

## Model

| Hyperparameter | Value |
|---|---|
| Vocabulary | 32 tokens (char-level or tiny BPE) |
| d_model | 8 |
| Context length | 16 tokens |
| Layers | 1 |
| Heads | 1 |
| Precision | int8 weights, int16 accumulators |
| Total weights | ~660 bytes |
| Compute per token | ~1500 8-bit multiplies → ~0.15 s @ 1 MHz |

## Repository layout

```
notebooks/   Progressive tutorial notebooks (01_bigram → 07_quantize)
train/       Final training script (trainer extracted from notebooks)
export/      Quantization + binary weight packer for the EEPROM
reference/   int8 forward pass in plain C — runs on Arduino as a known-good reference
firmware/
  6502/      ca65 assembly — the real implementation
  arduino/   I/O coprocessor sketch + EEPROM programmer
hardware/    Schematic, memory map, address decode
data/        Training corpora
docs/        Architecture notes, build log
```

## The build journey

Each notebook in `notebooks/` is a self-contained lesson. Read them in order:

| # | Notebook | What you'll learn |
|---|---|---|
| 01 | `01_bigram_baseline.ipynb` | Token embeddings, logits, cross-entropy. No attention yet. |
| 02 | `02_self_attention_by_hand.ipynb` | QKᵀ, softmax, weighted sum — by hand, no training. |
| 03 | `03_single_head_trained.ipynb` | First trained attention model. Watch loss drop. |
| 04 | `04_multi_head_then_collapse.ipynb` | Add heads, understand them, then collapse to 1 for hardware. |
| 05 | `05_layernorm_and_residual.ipynb` | Why these matter, what breaks without them. |
| 06 | `06_full_block_scaled_up.ipynb` | "Big" version (d=64) for sanity-checking against the tiny one. |
| 07 | `07_shrink_and_quantize.ipynb` | int8 quantization, d=8, the chip-bound version. |

After the notebooks: port to C (`reference/`), then to 6502 assembly (`firmware/6502/`), byte-comparing activations at every layer against the C reference.

## Status

| Stage | Status |
|---|---|
| Repo scaffold | done |
| Notebooks 01–07 | not started |
| Python trainer | not started |
| Weight quantizer + packer | not started |
| C reference inference | not started |
| Arduino I/O coprocessor | not started |
| EEPROM programmer | not started |
| 6502 assembly inference | not started |
| Hardware bring-up | not started |

## License

MIT (to be added).
