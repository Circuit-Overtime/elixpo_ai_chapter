"""Build the bundled emoji JSON from Unicode emoji-test and CLDR annotations."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = "18.0"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "src/win_dot_panel/resources/emoji.json"
SKIN_TONES = set(range(0x1F3FB, 0x1F400))
EMOJI_LINE = re.compile(r"^([0-9A-F ]+)\s*; fully-qualified\s*#\s*\S+\s+E[0-9.]+\s+(.+)$")


def stable_id(emoji: str) -> int:
    digest = hashlib.sha256(emoji.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") & 0x7FFF_FFFF_FFFF_FFFF


def build_records(emoji_test: str, annotations: dict[str, object]) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    used_ids: set[int] = set()
    group = ""
    subgroup = ""
    for line in emoji_test.splitlines():
        if line.startswith("# group: "):
            group = line.removeprefix("# group: ")
            continue
        if line.startswith("# subgroup: "):
            subgroup = line.removeprefix("# subgroup: ")
            continue
        match = EMOJI_LINE.match(line)
        if match is None:
            continue
        codepoints, name = match.groups()
        emoji = "".join(chr(int(codepoint, 16)) for codepoint in codepoints.split())
        base = "".join(character for character in emoji if ord(character) not in SKIN_TONES)
        annotation = annotations.get(emoji) or annotations.get(base) or {}
        keywords = annotation.get("default", []) if isinstance(annotation, dict) else []
        item_id = stable_id(emoji)
        if item_id in used_ids:
            raise ValueError(f"Duplicate stable emoji ID for {emoji}")
        used_ids.add(item_id)
        records.append(
            {
                "id": item_id,
                "emoji": emoji,
                "name": name,
                "category": group,
                "subcategory": subgroup,
                "keywords": " ".join(keywords),
                "sort_order": len(records),
            }
        )
    if not records:
        raise ValueError("No fully-qualified emoji found")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("emoji_test", type=Path)
    parser.add_argument("annotations", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    annotations = json.loads(args.annotations.read_text(encoding="utf-8"))
    terms = annotations["annotations"]["annotations"]
    records = build_records(args.emoji_test.read_text(encoding="utf-8"), terms)
    payload = {"version": VERSION, "emoji": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"Wrote {len(records)} emoji to {args.output}")


if __name__ == "__main__":
    main()
