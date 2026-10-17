"""Create a deterministic, self-contained arXiv bundle for the MNIST paper."""

from __future__ import annotations

import hashlib
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAPER = ROOT / "paper" / "v1_mnist_narrow"
OUTPUT = ROOT / "dist"
ARCHIVE = OUTPUT / "monodiffuse-mnist-arxiv.zip"
PDF = OUTPUT / "monodiffuse-mnist-paper.pdf"
EPOCH = (2026, 10, 14, 0, 0, 0)
SOURCES = (
    Path("paper.tex"),
    Path("paper.bbl"),
    Path("references.bib"),
    Path("figures/results/mnist-fp.png"),
    Path("figures/results/mnist-native-w1a32.png"),
    Path("figures/results/mnist-ptq-w1a32.png"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    missing = [str(PAPER / path) for path in (*SOURCES, Path("paper.pdf")) if not (PAPER / path).is_file()]
    if missing:
        raise SystemExit("missing manuscript files:\n" + "\n".join(missing))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in SOURCES:
            source = PAPER / relative
            info = zipfile.ZipInfo(relative.as_posix(), EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (source.stat().st_mode & 0xFFFF) << 16
            archive.writestr(info, source.read_bytes(), compresslevel=9)

    shutil.copy2(PAPER / "paper.pdf", PDF)
    print(f"saved {ARCHIVE} ({ARCHIVE.stat().st_size} bytes)")
    print(f"sha256 {sha256(ARCHIVE)}")
    print(f"saved {PDF} ({PDF.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
