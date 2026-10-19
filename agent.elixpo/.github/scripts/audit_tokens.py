"""Fail CI when restricted secrets escape their approved workflow set."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def audit(root: Path = ROOT) -> list[str]:
    policy = yaml.safe_load((root / "config/token_policy.yaml").read_text())
    if policy.get("schema_version") != 1:
        return ["unsupported token-policy schema"]
    errors: list[str] = []
    workflows = root / ".github/workflows"
    restricted = policy.get("restricted_secrets") or {}
    for path in sorted(workflows.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        referenced = set(re.findall(r"secrets\.([A-Z0-9_]+)", text))
        for secret in referenced & set(restricted):
            if path.name not in set(restricted[secret] or []):
                errors.append(f"{path.name}: {secret} is outside its approved workflow set")
        for pattern in policy.get("forbidden_literal_patterns") or []:
            if re.search(pattern, text):
                errors.append(f"{path.name}: possible literal credential matches {pattern!r}")
    return errors


def main() -> None:
    errors = audit()
    if errors:
        raise SystemExit("\n".join(errors))
    print("token workflow audit passed")


if __name__ == "__main__":
    main()
