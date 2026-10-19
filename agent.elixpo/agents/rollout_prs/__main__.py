from __future__ import annotations

import argparse
import asyncio
import json
import os

from agents.rollout_audit.core import load_manifest
from agents.rollout_prs.core import publish, scan, selected_repositories


async def _run(repo: str, concurrency: int, apply: bool) -> int:
    from lib.config import settings
    from lib.github.api import GitHubAPI
    from lib.publication import safety_check
    from rtk.budget import Budget
    from rtk.router import Router

    token = os.getenv("ELIXPOO_GITHUB_ROLLOUT_TOKEN", "").strip() or settings.github.token
    if not token:
        raise RuntimeError("ELIXPOO_GITHUB_ROLLOUT_TOKEN is required")
    root = settings.root
    manifest = load_manifest(root / "config/elixpoo_rollout.yaml")
    repositories = selected_repositories(manifest, repo)
    api = GitHubAPI.from_token(token)

    def progress(done: int, total: int, plan) -> None:
        print(f"[rollout] {done}/{total} {plan.repository}: {plan.status}", flush=True)

    try:
        plans = await scan(api, root, manifest, repositories, concurrency=concurrency, on_progress=progress)
        results: list[dict] = []
        if apply:
            if not settings.pollinations.api_key:
                raise RuntimeError("ELIXPO_POLLINATIONS_API_KEY is required for the public-post safety gate")
            router = Router.from_settings("rollout-prs", budget=Budget("rollout-prs", limit=2_000))
            await safety_check(
                router,
                "[CHORE] Install Elixpoo v2 project workflows. Installs thin event callers for the centralized "
                "project-management runtime; no implementation or product-code automation is copied.",
            )
            semaphore = asyncio.Semaphore(max(1, min(concurrency, 3)))

            async def publish_one(plan):
                if plan.excluded:
                    return {
                        "repository": f"{manifest['owner']}/{plan.repository}",
                        "status": "excluded",
                        "reason": plan.error,
                    }
                if plan.error:
                    return {
                        "repository": f"{manifest['owner']}/{plan.repository}",
                        "status": "failed",
                        "error": plan.error,
                    }
                async with semaphore:
                    return await publish(api, root, manifest, plan)

            results = list(await asyncio.gather(*(publish_one(plan) for plan in plans)))
        else:
            results = [
                {
                    "repository": f"{manifest['owner']}/{plan.repository}",
                    "status": plan.status,
                    "files": [{"path": change.path, "status": change.status} for change in plan.changes],
                    **({"error": plan.error} if plan.error else {}),
                }
                for plan in plans
            ]
    finally:
        await api.close()
    print(
        json.dumps(
            {"apply": apply, "runtime_ref": manifest["runtime_ref"], "results": results},
            indent=2,
            sort_keys=True,
        )
    )
    return 1 if any(result.get("status") == "failed" for result in results) else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Open reviewable Elixpoo v2 caller PRs")
    parser.add_argument("--repo", default="", help="Limit rollout to one repository name or owner/name")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--apply", action="store_true", help="Create branches and pull requests")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args.repo, args.concurrency, args.apply)))


if __name__ == "__main__":
    main()
