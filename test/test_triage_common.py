import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "scripts"))
sys.path.insert(0, str(ROOT / ".github"))

import _common  # noqa: E402
import ci_config  # noqa: E402


class FakeResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class TriageCommonTests(unittest.TestCase):
    def test_project_config_contains_only_stable_identifiers(self):
        for project in ci_config.PROJECTS.values():
            self.assertEqual(set(project), {"number", "url"})

    def test_rest_uses_repository_token(self):
        captured = {}

        def urlopen(request, timeout):
            captured["authorization"] = request.get_header("Authorization")
            return FakeResponse({"ok": True})

        with mock.patch.dict(os.environ, {"REPO_TOKEN": "repo-token"}, clear=False):
            with mock.patch.object(_common.urllib.request, "urlopen", urlopen):
                _common.github_rest("GET", "/repos/elixpo/sketch.elixpo")

        self.assertEqual(captured["authorization"], "Bearer repo-token")

    def test_graphql_uses_project_token_and_rejects_errors(self):
        captured = {}

        def urlopen(request, timeout):
            captured["authorization"] = request.get_header("Authorization")
            return FakeResponse({"errors": [{"message": "denied"}]})

        with mock.patch.dict(os.environ, {"PROJECT_TOKEN": "project-token"}, clear=False):
            with mock.patch.object(_common.urllib.request, "urlopen", urlopen):
                with self.assertRaisesRegex(RuntimeError, "GraphQL request failed"):
                    _common.github_graphql("query { viewer { login } }")

        self.assertEqual(captured["authorization"], "Bearer project-token")

    def test_graphql_allows_repository_token_for_issue_type_mutation(self):
        captured = {}

        def urlopen(request, timeout):
            captured["authorization"] = request.get_header("Authorization")
            return FakeResponse({"data": {"updateIssueIssueType": {"issue": {"id": "issue-id"}}}})

        with mock.patch.object(_common.urllib.request, "urlopen", urlopen):
            _common.github_graphql(
                "mutation { updateIssueIssueType(input: {}) { issue { id } } }",
                token="repo-token",
            )

        self.assertEqual(captured["authorization"], "Bearer repo-token")

    def test_resolves_project_fields_and_options_at_runtime(self):
        response = {
            "data": {
                "organization": {
                    "projectV2": {
                        "id": "project-id",
                        "fields": {
                            "nodes": [
                                {
                                    "id": "priority-field",
                                    "name": "Priority",
                                    "options": [{"id": "high-option", "name": "High"}],
                                },
                                {
                                    "id": "status-field",
                                    "name": "Status",
                                    "options": [{"id": "todo-option", "name": "Todo"}],
                                },
                            ]
                        },
                    }
                }
            }
        }
        with mock.patch.object(_common, "github_graphql", return_value=response):
            project = _common.resolve_org_project("elixpo", 5)

        self.assertEqual(project["id"], "project-id")
        self.assertEqual(project["priority_field_id"], "priority-field")
        self.assertEqual(project["priority_options"]["High"], "high-option")
        self.assertEqual(project["status_options"]["Todo"], "todo-option")

    def test_existing_project_membership_is_idempotent(self):
        response = {
            "data": {
                "node": {
                    "projectItems": {
                        "nodes": [
                            {"id": "item-id", "project": {"id": "project-id"}}
                        ]
                    }
                }
            }
        }
        with mock.patch.object(_common, "github_graphql", return_value=response) as graphql:
            item_id = _common.ensure_project_item("project-id", "content-id")

        self.assertEqual(item_id, "item-id")
        graphql.assert_called_once()


if __name__ == "__main__":
    unittest.main()
