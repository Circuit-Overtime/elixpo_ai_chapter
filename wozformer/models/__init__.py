"""Model architectures, one per file. Each extracted from its source notebook.

  transformer  ← nb05 / nb07b  (the baseline; teacher candidate for distillation)
  moe          ← nb09          (mixture of experts)
  rwkv         ← nb10          (linear-recurrence state-space)
  hdc          ← nb11          (Hebbian-trained pure HDC)
  hdc_rwkv     ← nb12c         (bipolar gradient-trained recurrence; SHIPPING)
"""
from .transformer import TinyTransformer  # noqa: F401
from .moe import TinyMoETransformer       # noqa: F401
from .rwkv import RWKVModel               # noqa: F401
from .hdc import HDCModel                 # noqa: F401
from .hdc_rwkv import HDCRWKV             # noqa: F401
from .hdc_rwkv_hybrid import HDCRWKVHybrid  # noqa: F401
from .hdc_rwkv_cont_decay import HDCRWKVContinuousDecay  # noqa: F401
