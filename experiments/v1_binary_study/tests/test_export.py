import numpy as np
import torch

from experiments.v1_binary_study.export import packed_state
from experiments.v1_binary_study.models import BinaryDiffusionUNet, ModelConfig


def test_binary_export_physically_packs_signs(tmp_path):
    config = ModelConfig(base_channels=8, binary_weights=True, centered=True)
    model = BinaryDiffusionUNet(config)
    path = tmp_path / "checkpoint.pt"
    torch.save(
        {"model": model.state_dict(), "model_config": config.__dict__, "dataset": "mnist", "variant": "test", "seed": 0},
        path,
    )

    arrays, metadata = packed_state(path)
    binary_name = next(name for name in metadata["tensors"] if metadata["tensors"][name]["kind"].startswith("binary"))
    element_count = metadata["tensors"][binary_name]["elements"]
    assert arrays[f"{binary_name}.packed"].nbytes == (element_count + 7) // 8
    assert arrays[f"{binary_name}.packed"].dtype == np.uint8
    assert metadata["packed_payload_bytes"] < metadata["fp32_equivalent_bytes"]
