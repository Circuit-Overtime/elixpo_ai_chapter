import torch

from experiments.v1_binary_study.diffusion import Diffusion
from experiments.v1_binary_study.models import BinaryDiffusionUNet, ModelConfig, QuantConv2d


def test_variants_are_parameter_compatible():
    full = BinaryDiffusionUNet(ModelConfig())
    binary = BinaryDiffusionUNet(ModelConfig(binary_weights=True, centered=True))
    assert full.state_dict().keys() == binary.state_dict().keys()
    for key in full.state_dict():
        assert full.state_dict()[key].shape == binary.state_dict()[key].shape


def test_centered_binary_forward_and_gradient():
    layer = QuantConv2d(3, 4, 3, padding=1, binary=True, centered=True)
    x = torch.randn(2, 3, 8, 8, requires_grad=True)
    layer(x).mean().backward()
    assert layer.weight.grad is not None
    assert torch.isfinite(layer.weight.grad).all()


def test_unet_and_sampler_shapes():
    model = BinaryDiffusionUNet(ModelConfig(base_channels=8))
    x = torch.randn(2, 1, 28, 28)
    assert model(x, torch.tensor([0, 999])).shape == x.shape
    diffusion = Diffusion(steps=10)
    assert diffusion.sample(model, x.shape, sampling_steps=2).shape == x.shape
    assert diffusion.sample_ddpm(model, x.shape).shape == x.shape
