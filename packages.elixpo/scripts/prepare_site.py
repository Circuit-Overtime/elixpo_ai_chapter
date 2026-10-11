"""Prepare the multi-product packages.elixpo.com Pages artifact."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

PRODUCTS = {
    "win-dot-panel": "Win Dot Panel",
    "screenbridge": "ScreenBridge",
}


def prepare_site(source: Path, destination: Path) -> None:
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    shutil.copytree(source, destination)

    template_path = destination / "install.sh.in"
    template = template_path.read_text(encoding="utf-8")
    template_path.unlink()

    for package, display_name in PRODUCTS.items():
        rendered = template.replace("@PACKAGE@", package).replace("@DISPLAY_NAME@", display_name)
        installer = destination / package / "install.sh"
        installer.parent.mkdir(parents=True, exist_ok=True)
        installer.write_text(rendered, encoding="utf-8")
        installer.chmod(0o755)

    # Keep the original public installer URL working for existing users.
    shutil.copy2(destination / "win-dot-panel/install.sh", destination / "install.sh")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source", type=Path, default=Path("web"))
    args = parser.parse_args()
    prepare_site(args.source, args.destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
