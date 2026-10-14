# Security policy

MonoDiffuse is research software and is not designed to process untrusted model
files. PyTorch checkpoint files use a serialization format that can execute code
when deserialized, especially when loaded with `weights_only=False`.

The versions in `requirements.txt` reproduce the published environment; they
must not be interpreted as a general-purpose secure dependency baseline. Only
load checkpoints committed to this repository or obtained from a release whose
SHA-256 digest has been verified. Do not pass downloaded or user-supplied `.pt`,
`.pth`, or `.ckpt` files to the training, evaluation, export, or Diffuino tools.

For new deployments that must accept external inputs, use a currently supported
PyTorch release, a non-executable weight format such as safetensors or ONNX where
appropriate, and an isolated least-privilege runtime.

Report suspected vulnerabilities privately through GitHub's security advisory
interface rather than opening a public issue.
