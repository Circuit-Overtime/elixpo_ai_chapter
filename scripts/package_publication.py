"""Build deterministic-ish local upload bundles for the paper and software.

Generated files live under ``dist/`` and are intentionally ignored by Git.
The script never modifies the source manuscript or tracked experiment artifacts.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "publication"
EPOCH = (2026, 10, 14, 0, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b"\0") if item]


def write_source_zip(destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(tracked_files()):
            if not path.is_file() or path == destination:
                continue
            relative = path.relative_to(ROOT)
            info = zipfile.ZipInfo(f"monodiffuse-v1.0.0/{relative.as_posix()}", EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (path.stat().st_mode & 0xFFFF) << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)


def write_manuscript_zip(source_directory: Path, destination: Path) -> None:
    files = [
        source_directory / "paper.tex",
        source_directory / "paper.bbl",
        source_directory / "references.bib",
        *(source_directory / "figures" / "results").glob("*.png"),
    ]
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            if not path.is_file():
                raise SystemExit(f"missing manuscript dependency: {path}")
            relative = path.relative_to(source_directory)
            info = zipfile.ZipInfo(relative.as_posix(), EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (path.stat().st_mode & 0xFFFF) << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)


def main() -> None:
    paper = ROOT / "paper" / "v1_mnist_narrow" / "paper.pdf"
    if not paper.exists():
        raise SystemExit(f"missing {paper}; build the manuscript first")

    engrxiv = OUTPUT / "engrxiv"
    preprints = OUTPUT / "preprints"
    zenodo_preprint = OUTPUT / "zenodo-preprint"
    zenodo = OUTPUT / "zenodo"
    shutil.rmtree(OUTPUT, ignore_errors=True)
    engrxiv.mkdir(parents=True)
    preprints.mkdir(parents=True)
    zenodo_preprint.mkdir(parents=True)
    zenodo.mkdir(parents=True)

    manuscript = engrxiv / "monodiffuse-preprint.pdf"
    shutil.copy2(paper, manuscript)
    shutil.copy2(ROOT / "publication" / "engrxiv-metadata.md", engrxiv / "metadata.md")

    source = engrxiv / "monodiffuse-v1.0.0-source.zip"
    write_source_zip(source)

    preprints_pdf = preprints / "monodiffuse-preprint.pdf"
    preprints_source = preprints / "monodiffuse-manuscript-source.zip"
    shutil.copy2(paper, preprints_pdf)
    write_manuscript_zip(paper.parent, preprints_source)

    zenodo_preprint_pdf = zenodo_preprint / "monodiffuse-preprint.pdf"
    zenodo_preprint_source = zenodo_preprint / "monodiffuse-manuscript-source.zip"
    shutil.copy2(paper, zenodo_preprint_pdf)
    shutil.copy2(preprints_source, zenodo_preprint_source)
    shutil.copy2(
        ROOT / "publication" / "zenodo-preprint-metadata.md",
        zenodo_preprint / "metadata.md",
    )

    shutil.copy2(ROOT / "CITATION.cff", zenodo / "CITATION.cff")
    shutil.copy2(ROOT / "publication" / "zenodo-software-metadata.md", zenodo / "metadata.md")

    files = [
        manuscript,
        source,
        preprints_pdf,
        preprints_source,
        zenodo_preprint_pdf,
        zenodo_preprint_source,
        zenodo_preprint / "metadata.md",
        zenodo / "CITATION.cff",
        zenodo / "metadata.md",
    ]
    lines = [f"{sha256(path)}  {path.relative_to(OUTPUT)}" for path in files]
    (OUTPUT / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"built {OUTPUT}")
    for line in lines:
        print(line)


if __name__ == "__main__":
    main()
