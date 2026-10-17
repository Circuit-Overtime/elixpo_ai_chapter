"""One-shot: generate the README hero banner from prompts/oreoos_banner.md.

Drops the result at docs/images/banner.png so the README picks it up
via the standard relative-path reference. Re-run any time the prompt or
the desired aspect ratio changes — the file is committed alongside the
README so first-time visitors see it without running the pipeline.

Usage:
    python tools/_gen_banner.py            # default seed 42
    python tools/_gen_banner.py --seed 7
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.generate_assets import _read_prompt, download_to


OUT_PATH = Path("docs/images/banner.png")
WIDTH    = 1280
HEIGHT   = 360


def _seed():
    if "--seed" in sys.argv:
        i = sys.argv.index("--seed")
        try:
            return int(sys.argv[i + 1])
        except (IndexError, ValueError):
            pass
    return 42


def main():
    prompt = _read_prompt("prompts/oreoos_banner.md")
    if not prompt:
        sys.exit("No 'Prompt' section in prompts/oreoos_banner.md")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not download_to(prompt, OUT_PATH, width=WIDTH, height=HEIGHT, seed=_seed()):
        sys.exit("Download failed.")
    print("Banner saved at", OUT_PATH)


if __name__ == "__main__":
    main()
