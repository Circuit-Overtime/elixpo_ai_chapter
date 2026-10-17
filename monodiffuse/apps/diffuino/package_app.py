"""Build a deterministic, runtime-only Arduino App archive for Diffuino."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


APP_ROOT = Path(__file__).resolve().parent
REPO_ROOT = APP_ROOT.parents[1]
PACKAGE_FILES = (
    "app.yaml",
    "README.md",
    "python/__init__.py",
    "python/classifier.py",
    "python/display.py",
    "python/frame.py",
    "python/main.py",
    "python/presets.py",
    "python/requirements.txt",
    "python/runtime.py",
    "python/status.py",
    "sketch/sketch.ino",
    "sketch/sketch.yaml",
    "models/mnist_conditional_fp32.onnx",
    "models/mnist_classifier.onnx",
)


def _entry(name: str, data: bytes) -> tuple[ZipInfo, bytes]:
    info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    return info, data


def build_package(output: Path) -> Path:
    """Write the allowlisted app files and their hashes to output."""
    missing = [name for name in PACKAGE_FILES if not (APP_ROOT / name).is_file()]
    if missing:
        raise FileNotFoundError(f"package inputs missing: {', '.join(missing)}")

    payloads = [(name, (APP_ROOT / name).read_bytes()) for name in PACKAGE_FILES]
    manifest = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in payloads
    ).encode()

    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w") as archive:
        for name, data in payloads:
            archive.writestr(*_entry(name, data), compresslevel=9)
        archive.writestr(*_entry("MANIFEST.sha256", manifest), compresslevel=9)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "dist" / "diffuino.zip",
        help="destination ZIP (default: dist/diffuino.zip)",
    )
    args = parser.parse_args()
    output = build_package(args.output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"saved {output} ({output.stat().st_size} bytes)")
    print(f"sha256 {digest}")


if __name__ == "__main__":
    main()
