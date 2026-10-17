#!/usr/bin/env python3
"""Assemble the citable QFabric release assets and their checksums."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="1.0.2")
    args = parser.parse_args()

    version = args.version
    output = ROOT / "dist" / f"release-v{version}"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    sources = {
        ROOT / "dist" / f"qfabric-{version}-py3-none-any.whl": (
            f"qfabric-{version}-py3-none-any.whl"
        ),
        ROOT / "dist" / f"qfabric-{version}.tar.gz": f"qfabric-{version}.tar.gz",
        ROOT / "paper" / "qfabric-paper.pdf": f"QFabric-v{version}-paper.pdf",
        ROOT / "docs" / "releases" / f"v{version}.md": (
            f"QFabric-v{version}-release-notes.md"
        ),
        ROOT
        / "data"
        / "processed"
        / "stage11"
        / "stage11-evaluation-01"
        / "evaluation.json": f"QFabric-v{version}-stage11-evaluation.json",
    }

    for source, destination in sources.items():
        if not source.is_file():
            raise FileNotFoundError(f"required release asset is missing: {source}")
        shutil.copy2(source, output / destination)

    manifest = {
        "schema_version": 1,
        "project": "QFabric",
        "version": version,
        "tag": f"v{version}",
        "git_commit": git_commit(),
        "assets": sorted(path.name for path in output.iterdir()),
    }
    manifest_path = output / "release-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    assets = sorted(path for path in output.iterdir() if path.name != "SHA256SUMS")
    checksums = "".join(f"{sha256(path)}  {path.name}\n" for path in assets)
    (output / "SHA256SUMS").write_text(checksums, encoding="ascii")
    print(output.relative_to(ROOT))


if __name__ == "__main__":
    main()
