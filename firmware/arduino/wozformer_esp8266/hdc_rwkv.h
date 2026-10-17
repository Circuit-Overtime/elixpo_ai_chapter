// HDC-RWKV inference for ESP8266
// All weights are bipolar (1 bit per dim) stored in PROGMEM.
// Forward pass: XOR + popcount for matmul-like ops, tanh in fp32.

#pragma once
#include <Arduino.h>
#include "model_data.h"
#include "bpe_tables.h"

#ifdef __cplusplus
extern "C" {
#endif

// ---- Configuration constants ----
#define WOZ_MAX_TOKENS  128   // hard cap on output length per generation

// ---- BPE encoding ----
// Encode a UTF-8 prompt string into BPE token IDs.
// `out` must hold at least WOZ_MAX_TOKENS ids.
// Returns the number of tokens written.
int woz_bpe_encode(const char* text, uint8_t* out, int max_out);

// Decode a single token id into its UTF-8 string (copies into `out`, returns length).
// `out` must hold at least 32 bytes (longest token + null).
int woz_decode_token(uint8_t tok_id, char* out, int max_out);

// ---- HDC-RWKV forward pass ----
// Given the most recent up-to-WOZ_BLOCK_SIZE token ids (oldest first),
// fill `logits` (length WOZ_VOCAB_SIZE) with the softmax-able output scores
// for the next token.
void woz_forward(const uint8_t* token_ids, int n_tokens, float* logits);

// ---- Sampling ----
// Given logits, sample one token with temperature + top-k.
// Uses ESP8266's hardware random number generator for sampling.
// Returns token id in [0, WOZ_VOCAB_SIZE).
uint8_t woz_sample(float* logits, float temperature, int top_k);

// ---- Reproducible seeding ----
void woz_seed(uint32_t seed);

#ifdef __cplusplus
}
#endif
