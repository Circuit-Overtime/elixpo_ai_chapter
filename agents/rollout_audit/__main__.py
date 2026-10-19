from __future__ import annotations

import argparse
import asyncio
import json

from agents.rollout_audit.core import audit, load_manifest


async def _run(repo: str, concurrency: int) -> int:
    from lib.config import settings
    from lib.github.api import GitHubAPI

    if not settings.github.token:
        raise RuntimeError("GITHUB_TOKEN or ELIXPOO_GITHUB_AGENTIC_TOKEN is required")
    manifest = load_manifest(settings.root / "config/elixpoo_rollout.yaml")
    api = GitHubAPI.from_token(settings.github.token)
    try:
        result = await audit(api, manifest, only_repo=repo, concurrency=concurrency)
    finally:
        await api.close()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only Elixpoo caller rollout audit")
    parser.add_argument("--repo", default="", help="Audit one repository name or owner/name")
    parser.add_argument("--concurrency", type=int, default=5)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args.repo, args.concurrency)))


if __name__ == "__main__":
    main()
