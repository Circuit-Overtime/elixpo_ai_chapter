"""CLI for deterministic Gist memory maintenance."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import timedelta

import structlog

from agents.gist_custodian.core import maintain_gist

log = structlog.get_logger()


async def _run(*, dry_run: bool, repair: bool, confirm_reset: bool) -> int:
    from lib.config import settings
    from lib.github.api import GitHubAPI
    from lib.github.gists import GistConflictError, RevisionedGist
    from lib.state.store import StateStore

    if not settings.followups.gist_token or not settings.followups.gist_id:
        log.error(
            "gist_custodian.missing_credentials",
            hint="set ELIXPOO_GIST_AGENTIC_TOKEN and ELIXPOO_FOLLOWUP_GIST_ID",
        )
        return 2
    if repair and not confirm_reset:
        log.error("gist_custodian.repair_unconfirmed", hint="add --confirm-reset after inspecting the receipt")
        return 2
    api = GitHubAPI.from_token(settings.followups.gist_token)
    store = StateStore(settings.state_dir)
    try:
        receipt = await maintain_gist(
            RevisionedGist(api, settings.followups.gist_id),
            dry_run=dry_run,
            repair=repair,
            confirm_reset=confirm_reset,
        )
    except GistConflictError as exc:
        log.warning("gist_custodian.conflict", error=str(exc))
        return 75
    finally:
        await api.close()
    store.write_state(
        "gist_custodian.json",
        receipt,
        producer="gist-custodian",
        ttl=timedelta(days=7),
    )
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 1 if receipt["status"] == "repair_required" else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Maintain bounded elixpoo Gist memory")
    parser.add_argument("--dry-run", action="store_true", help="inspect changes without writing the Gist")
    parser.add_argument("--repair", action="store_true", help="reset corrupted managed files to empty schemas")
    parser.add_argument("--confirm-reset", action="store_true", help="confirm corrupted-file reset")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(**vars(args))))


if __name__ == "__main__":
    main()
