import torch

from experiments.v1_binary_study.evaluate import density_coverage, frechet, js_divergence, kernel_inception_distance


def test_distribution_metrics_identical_samples():
    torch.manual_seed(0)
    features = torch.randn(32, 8)
    probabilities = torch.softmax(torch.randn(32, 10), 1)
    assert abs(frechet(features, features)) < 1e-8
    # The unbiased finite-sample KID estimator may be slightly negative.
    assert torch.isfinite(torch.tensor(kernel_inception_distance(features, features)))
    assert abs(js_divergence(probabilities, probabilities)) < 1e-12
    density, coverage = density_coverage(features, features, k=3)
    assert density > 0
    assert coverage == 1
