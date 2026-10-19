from __future__ import annotations

import base64

from agents.rollout_prs.core import (
    RolloutPlan,
    desired_callers,
    plan_repository,
    publish,
    selected_repositories,
)


class API:
    def __init__(self):
        self.files: dict[str, bytes] = {}
        self.refs: list[tuple[str, str]] = []
        self.pulls: list[dict] = []

    async def get_repo_contents(self, owner, repo, path):
        if path not in self.files:
            response = type("Response", (), {"status_code": 404})()
            error = RuntimeError("missing")
            error.response = response
            raise error
        return {"type": "file", "content": base64.b64encode(self.files[path]).decode()}

    async def list_pulls(self, owner, repo, *, state, per_page):
        return self.pulls

    async def get_default_branch(self, owner, repo):
        return "main"

    async def get_ref(self, owner, repo, ref):
        return {"object": {"sha": "base"}}

    async def get_commit(self, owner, repo, sha):
        return {"tree": {"sha": "tree-base"}}

    async def create_blob(self, owner, repo, content):
        return {"sha": f"blob-{len(content)}"}

    async def create_tree(self, owner, repo, base_tree, tree):
        return {"sha": "tree-new"}

    async def create_commit(self, owner, repo, message, tree, parents):
        assert message == "chore: install Elixpoo v2 callers"
        return {"sha": "commit-new"}

    async def create_ref(self, owner, repo, ref, sha):
        self.refs.append((ref, sha))

    async def create_pull(self, owner, repo, title, body, head, base):
        pull = {"head": {"ref": head}, "html_url": "https://example/pr/1"}
        self.pulls.append(pull)
        return pull


def manifest() -> dict:
    return {
        "owner": "elixpo",
        "runtime_repository": "elixpo/agent.elixpo",
        "runtime_ref": "v2",
        "repositories": {
            "agent.elixpo": {"triage": True},
            "alpha": {"triage": True, "mentions": True},
            "later": {"deferred": True, "triage": True},
        },
    }


def test_selection_excludes_runtime_and_deferred_repositories() -> None:
    assert selected_repositories(manifest()) == ["alpha"]
    assert selected_repositories(manifest(), "elixpo/alpha") == ["alpha"]


async def test_plan_reports_only_missing_or_changed_callers(tmp_path) -> None:
    folder = tmp_path / "distribution" / "workflows"
    folder.mkdir(parents=True)
    (folder / "elixpoo-triage.yml").write_text("triage\n")
    (folder / "elixpoo-mentions.yml").write_text("mentions\n")
    desired = desired_callers(tmp_path, manifest()["repositories"]["alpha"])
    api = API()
    api.files[".github/workflows/elixpoo-triage.yml"] = b"triage\n"

    changes = await plan_repository(api, "elixpo", "alpha", desired)

    assert [(change.path, change.status) for change in changes] == [
        (".github/workflows/elixpoo-mentions.yml", "add")
    ]


async def test_publish_is_idempotent(tmp_path) -> None:
    folder = tmp_path / "distribution" / "workflows"
    folder.mkdir(parents=True)
    (folder / "elixpoo-triage.yml").write_text("triage\n")
    (folder / "elixpoo-mentions.yml").write_text("mentions\n")
    desired = desired_callers(tmp_path, manifest()["repositories"]["alpha"])
    changes = tuple(await plan_repository(API(), "elixpo", "alpha", desired))
    plan = RolloutPlan("alpha", changes)
    api = API()

    opened = await publish(api, tmp_path, manifest(), plan)
    duplicate = await publish(api, tmp_path, manifest(), plan)

    assert opened["status"] == "opened"
    assert duplicate["status"] == "already_open"
    assert len(api.refs) == 1
