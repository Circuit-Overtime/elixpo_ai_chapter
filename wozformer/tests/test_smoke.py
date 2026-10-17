"""Smoke tests: each module imports and a tiny end-to-end runs without crashing.

Not pytest-required — runs as a plain script too.
"""
from __future__ import annotations

import torch

from wozformer import (
    config,
    data,
    distillation,
    generate,
    metrics,
    models,
    ste,
    tokenizer,
    trainer,
    utils,
)


def test_ste_is_sign_in_forward_identity_in_backward() -> None:
    x = torch.tensor([0.3, -0.7, 1.5, -2.1], requires_grad=True)
    y = ste.ste_sign(x)
    expected = torch.tensor([1.0, -1.0, 1.0, -1.0])
    assert torch.allclose(y, expected, atol=1e-5), f"got {y.tolist()}"
    y.sum().backward()
    # Inside [-1, 1] gradient = 1; outside = 0
    assert x.grad.tolist() == [1.0, 1.0, 0.0, 0.0]


def test_tokenizer_round_trip_on_small_text() -> None:
    text = "the king and the queen are here"
    tok = tokenizer.BPETokenizer.train(text * 10, vocab_size=64)
    ids = tok.encode("the king")
    s = tok.decode(ids)
    assert "the" in s and "king" in s


def test_transformer_forward_shape() -> None:
    cfg = config.TransformerConfig(vocab_size=32, d_model=8, num_heads=1, n_layers=1, mlp_mult=2)
    m = models.TinyTransformer(cfg, block_size=16)
    x = torch.randint(0, 32, (4, 16))
    y = torch.randint(0, 32, (4, 16))
    logits, loss = m(x, y)
    assert logits.shape == (4, 16, 32)
    assert loss.dim() == 0  # scalar


def test_hdc_rwkv_soft_and_hard_match_on_init() -> None:
    cfg = config.HDCRWKVConfig(vocab_size=32, d=64, n_layers=1, block_size=8)
    m = models.HDCRWKV(cfg)
    x = torch.randint(0, 32, (4, 8))
    y = torch.randint(0, 32, (4, 8))
    logits_soft, loss_soft = m(x, y)
    logits_hard, loss_hard = m.forward_hard(x, y)
    assert logits_soft.shape == logits_hard.shape == (4, 8, 32)
    # Forward STE = .sign() under no_grad, so they must match exactly at init
    assert torch.allclose(loss_soft, loss_hard, atol=1e-6)


def test_distillation_step_runs() -> None:
    t_cfg = config.TransformerConfig(vocab_size=32, d_model=16, num_heads=1, n_layers=1, mlp_mult=2)
    s_cfg = config.HDCRWKVConfig(vocab_size=32, d=32, n_layers=1, block_size=8)
    teacher = models.TinyTransformer(t_cfg, block_size=8)
    student = models.HDCRWKV(s_cfg)
    teacher.eval()
    x = torch.randint(0, 32, (2, 8))
    y = torch.randint(0, 32, (2, 8))
    loss, info = distillation.distill_step(student, teacher, x, y, config.DistillationConfig())
    assert torch.isfinite(loss)
    assert "nll" in info and "kl" in info


def test_hdc_rwkv_hybrid_forward_and_quantization() -> None:
    """Hybrid HDC-RWKV: train forward + hard forward + int8 prototype quantization."""
    cfg = config.HDCRWKVHybridConfig(vocab_size=32, d=64, n_layers=1, block_size=8)
    m = models.HDCRWKVHybrid(cfg)
    x = torch.randint(0, 32, (4, 8))
    y = torch.randint(0, 32, (4, 8))

    # Train forward (STE on binary params, fp32 on prototype)
    logits, loss = m(x, y)
    assert logits.shape == (4, 8, 32)
    assert torch.isfinite(loss)

    # Hard forward with prototype quantized to int8
    logits_h, loss_h = m.forward_hard(x, y, quantize_prototype=True)
    assert logits_h.shape == (4, 8, 32)
    assert torch.isfinite(loss_h)

    # Hard forward without quantization (sanity check it still works)
    logits_h2, loss_h2 = m.forward_hard(x, y, quantize_prototype=False)
    assert torch.isfinite(loss_h2)

    # Int8 prototype quantization helper
    q, scale = m.quantize_prototype_int8()
    assert q.dtype == torch.int8
    assert q.shape == (32, 64)
    assert 0 < scale < 1.0

    # Deployment bytes: bipolar (vocab+decay) + int8 (prototype)
    db = m.deployment_bytes()
    expected = (32*64 + 1*64) // 8 + 32*64
    assert db == expected, f'got {db}, expected {expected}'


def test_hdc_rwkv_cont_decay_forward_and_init() -> None:
    """Continuous-decay variant: decay is sigmoid-bounded, prototype int8."""
    cfg = config.HDCRWKVContinuousDecayConfig(vocab_size=32, d=64, n_layers=1, block_size=8)
    m = models.HDCRWKVContinuousDecay(cfg)
    x = torch.randint(0, 32, (4, 8))
    y = torch.randint(0, 32, (4, 8))

    # Decay should sigmoid to (0, 1), default init around sigmoid(2) ≈ 0.88
    decay0 = torch.sigmoid(m.decay_logits[0]).detach()
    assert (decay0 > 0).all() and (decay0 < 1).all()
    assert 0.80 < decay0.mean().item() < 0.92, f'unexpected init decay mean: {decay0.mean().item()}'

    # Train forward + hard forward both work
    logits, loss = m(x, y)
    assert logits.shape == (4, 8, 32)
    assert torch.isfinite(loss)

    logits_h, loss_h = m.forward_hard(x, y, quantize_prototype=True)
    assert torch.isfinite(loss_h)

    # Deployment bytes account for bipolar vocab + fp16 decay + int8 prototype
    db = m.deployment_bytes()
    expected = (32 * 64) // 8 + 1 * 64 * 2 + 32 * 64
    assert db == expected, f'got {db}, expected {expected}'


def test_generate_runs() -> None:
    text = "hello world this is a small test of the tokenizer and model " * 50
    tok = tokenizer.BPETokenizer.train(text, vocab_size=32)
    cfg = config.HDCRWKVConfig(vocab_size=32, d=32, n_layers=1, block_size=8)
    m = models.HDCRWKV(cfg)
    out = generate.generate(
        m, tok, prompt="hello", max_new_tokens=5, block_size=8, seed=0
    )
    assert isinstance(out, str) and len(out) > 0


if __name__ == "__main__":
    # Run every test as a script
    tests = [
        test_ste_is_sign_in_forward_identity_in_backward,
        test_tokenizer_round_trip_on_small_text,
        test_transformer_forward_shape,
        test_hdc_rwkv_soft_and_hard_match_on_init,
        test_distillation_step_runs,
        test_hdc_rwkv_hybrid_forward_and_quantization,
        test_hdc_rwkv_cont_decay_forward_and_init,
        test_generate_runs,
    ]
    for t in tests:
        print(f"running {t.__name__}...", end=" ", flush=True)
        t()
        print("OK")
    print(f"\n{len(tests)} tests passed")
