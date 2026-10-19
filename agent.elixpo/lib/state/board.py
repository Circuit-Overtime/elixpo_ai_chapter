"""Idempotent GitHub Project V2 operations for autonomous contribution state."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

AGENT_STATUSES = (
    "discovered",
    "vetted",
    "claimed",
    "solving",
    "ready",
    "submitted",
    "open",
    "changes requested",
    "CI failed",
    "merged",
    "closed",
    "rejected",
    "cleanup pending",
)

FIELD_TYPES = {
    "Agent Status": "SINGLE_SELECT",
    "Issue Key": "TEXT",
    "Current Squad": "TEXT",
    "Run ID": "TEXT",
    "Branch": "TEXT",
    "PR URL": "TEXT",
    "Started At": "TEXT",
    "Updated At": "TEXT",
    "Token Target": "NUMBER",
    "Token Spend": "NUMBER",
    "Doctor Warning": "TEXT",
    "Cleanup Status": "TEXT",
}

OPERATIONS_VIEWS = {
    "Active work": '"Agent Status":discovered,vetted,claimed,solving,ready',
    "Awaiting maintainers": '"Agent Status":submitted,open,"changes requested"',
    "Failures": '"Agent Status":"CI failed",rejected,"cleanup pending"',
    "Merged contributions": '"Agent Status":merged,closed',
    "Token anomalies": '"Doctor Warning":*',
    "Cleanup debt": '-"Cleanup Status":complete',
}

_PROJECT_FRAGMENT = """
id
number
title
fields(first: 100) {
  nodes {
    __typename
    ... on ProjectV2Field { id name dataType }
    ... on ProjectV2SingleSelectField { id name dataType options { id name } }
  }
}
views(first: 50) { nodes { id name filter } }
"""


class BoardRejected(RuntimeError):
    pass


class ProjectSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issue_key: str = Field(min_length=3)
    issue_node_id: str = Field(min_length=1)
    issue_url: str = Field(min_length=1)
    status: str
    current_squad: str
    run_id: str = ""
    branch: str = ""
    pr_url: str = ""
    started_at: str = ""
    updated_at: str
    token_target: int = Field(default=0, ge=0)
    token_spend: int = Field(default=0, ge=0)
    doctor_warning: str = ""
    cleanup_status: str = ""


def _stamp(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise BoardRejected(f"invalid project transition timestamp: {value}") from exc


class Board:
    """Provision fields and reconcile issue-backed project items."""

    def __init__(self, api, owner: str, number: int):
        if not owner.strip() or int(number) <= 0:
            raise ValueError("Project owner and positive project number are required")
        self.api = api
        self.owner = owner.strip()
        self.number = int(number)

    @classmethod
    async def create(cls, api, owner: str, title: str = "Elixpoo Operations") -> tuple[Board, dict]:
        """Explicitly create one public operations Project; never called by reconciliation."""
        query = """
        query($login:String!) {
          repositoryOwner(login:$login) {
            __typename
            ... on Organization {
              id
              projectsV2(first:100) { nodes { id number title closed } }
            }
            ... on User {
              id
              projectsV2(first:100) { nodes { id number title closed } }
            }
          }
        }
        """
        identity = await api.graphql(query, {"login": owner})
        repository_owner = identity.get("repositoryOwner") or {}
        owner_id = str(repository_owner.get("id") or "")
        if not owner_id:
            raise BoardRejected(f"GitHub Project owner {owner!r} was not found")
        project = next(
            (
                candidate
                for candidate in ((repository_owner.get("projectsV2") or {}).get("nodes") or [])
                if candidate and str(candidate.get("title") or "") == title and not candidate.get("closed")
            ),
            None,
        )
        reused = project is not None
        if project is None:
            mutation = """
            mutation($owner:ID!,$title:String!) {
              createProjectV2(input:{ownerId:$owner,title:$title}) { projectV2 { id number title } }
            }
            """
            result = await api.graphql(mutation, {"owner": owner_id, "title": title})
            project = (result.get("createProjectV2") or {}).get("projectV2")
            if not project:
                raise BoardRejected("GitHub did not create the operations Project")
        board = cls(api, owner, int(project["number"]))
        await api.graphql(
            "mutation($project:ID!){updateProjectV2(input:{projectId:$project,public:true}){projectV2{id}}}",
            {"project": project["id"]},
        )
        if reused:
            project = await board.project()
        return board, project

    async def project(self) -> dict[str, Any]:
        query = (
            "query($login:String!,$number:Int!){"
            "repositoryOwner(login:$login){"
            "__typename "
            f"... on Organization{{projectV2(number:$number){{{_PROJECT_FRAGMENT}}}}}"
            f"... on User{{projectV2(number:$number){{{_PROJECT_FRAGMENT}}}}}"
            "}"
            "}"
        )
        data = await self.api.graphql(query, {"login": self.owner, "number": self.number})
        project = (data.get("repositoryOwner") or {}).get("projectV2")
        if not project:
            raise BoardRejected(f"GitHub Project {self.owner}/{self.number} was not found")
        return project

    async def ensure_fields(self, project: dict[str, Any]) -> dict[str, dict]:
        fields = {
            str(field.get("name") or ""): field
            for field in ((project.get("fields") or {}).get("nodes") or [])
            if field and field.get("id") and field.get("name")
        }
        for name, data_type in FIELD_TYPES.items():
            if name in fields:
                if str(fields[name].get("dataType") or "") != data_type:
                    raise BoardRejected(f"Project field {name!r} has the wrong type")
                continue
            variables: dict[str, Any] = {
                "project": project["id"],
                "name": name,
                "dataType": data_type,
                "options": None,
            }
            if name == "Agent Status":
                variables["options"] = [
                    {"name": status, "color": "GRAY", "description": f"Agent lifecycle: {status}"}
                    for status in AGENT_STATUSES
                ]
            mutation = """
            mutation($project:ID!,$name:String!,$dataType:ProjectV2CustomFieldType!,
                     $options:[ProjectV2SingleSelectFieldOptionInput!]) {
              createProjectV2Field(input:{projectId:$project,name:$name,dataType:$dataType,
                                          singleSelectOptions:$options}) {
                projectV2Field {
                  __typename
                  ... on ProjectV2Field { id name dataType }
                  ... on ProjectV2SingleSelectField { id name dataType options { id name } }
                }
              }
            }
            """
            result = await self.api.graphql(mutation, variables)
            field = (result.get("createProjectV2Field") or {}).get("projectV2Field")
            if not field:
                raise BoardRejected(f"GitHub did not create Project field {name!r}")
            fields[name] = field
        status_options = {str(option["name"]): option for option in fields["Agent Status"].get("options") or []}
        missing = set(AGENT_STATUSES) - set(status_options)
        if missing:
            raise BoardRejected(f"Agent Status is missing options: {sorted(missing)}")
        return fields

    async def ensure_views(self, project: dict[str, Any], fields: dict[str, dict]) -> list[dict]:
        """Create/update agent-owned filtered views while leaving all other views untouched."""
        existing = {
            str(view.get("name") or ""): view
            for view in ((project.get("views") or {}).get("nodes") or [])
            if view and view.get("id") and view.get("name")
        }
        visible = [field["id"] for name, field in fields.items() if name in FIELD_TYPES]
        results: list[dict] = []
        for name, filter_query in OPERATIONS_VIEWS.items():
            view = existing.get(name)
            created = False
            if view is None:
                mutation = """
                mutation($project:ID!,$name:String!,$visible:[ID!]) {
                  createProjectV2View(input:{projectId:$project,name:$name,layout:TABLE_LAYOUT,
                                             configuration:{visibleFieldIds:$visible}}) {
                    projectV2View { id name }
                  }
                }
                """
                data = await self.api.graphql(
                    mutation,
                    {"project": project["id"], "name": name, "visible": visible},
                )
                view = (data.get("createProjectV2View") or {}).get("projectV2View")
                if not view:
                    raise BoardRejected(f"GitHub did not create Project view {name!r}")
                created = True
            if str(view.get("filter") or "") != filter_query:
                mutation = """
                mutation($view:ID!,$filter:String!,$visible:[ID!]) {
                  updateProjectV2View(input:{viewId:$view,filter:$filter,
                                             configuration:{visibleFieldIds:$visible}}) {
                    projectV2View { id name filter }
                  }
                }
                """
                await self.api.graphql(
                    mutation,
                    {"view": view["id"], "filter": filter_query, "visible": visible},
                )
            results.append({"id": view["id"], "name": name, "created": created, "filter": filter_query})
        return results

    async def _find_item(self, project_id: str, issue_node_id: str) -> dict | None:
        cursor: str | None = None
        while True:
            query = """
            query($project:ID!,$cursor:String) {
              node(id:$project) {
                ... on ProjectV2 {
                  items(first:100,after:$cursor) {
                    nodes {
                      id
                      content { ... on Issue { id url } }
                      fieldValues(first:30) {
                        nodes {
                          __typename
                          ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
                          ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2Field { name } } }
                          ... on ProjectV2ItemFieldSingleSelectValue {
                            name field { ... on ProjectV2SingleSelectField { name } }
                          }
                        }
                      }
                    }
                    pageInfo { hasNextPage endCursor }
                  }
                }
              }
            }
            """
            data = await self.api.graphql(query, {"project": project_id, "cursor": cursor})
            connection = (data.get("node") or {}).get("items") or {}
            for item in connection.get("nodes") or []:
                if str((item.get("content") or {}).get("id") or "") == issue_node_id:
                    return item
            page = connection.get("pageInfo") or {}
            if not page.get("hasNextPage"):
                return None
            cursor = str(page.get("endCursor") or "")
            if not cursor:
                raise BoardRejected("Project item pagination returned no cursor")

    async def ensure_item(self, project_id: str, issue_node_id: str) -> tuple[dict, bool]:
        item = await self._find_item(project_id, issue_node_id)
        if item:
            return item, False
        mutation = """
        mutation($project:ID!,$content:ID!) {
          addProjectV2ItemById(input:{projectId:$project,contentId:$content}) { item { id } }
        }
        """
        data = await self.api.graphql(mutation, {"project": project_id, "content": issue_node_id})
        item = (data.get("addProjectV2ItemById") or {}).get("item")
        if not item:
            raise BoardRejected("GitHub did not add the issue to the Project")
        return item, True

    @staticmethod
    def _values(item: dict) -> dict[str, Any]:
        values: dict[str, Any] = {}
        for node in (item.get("fieldValues") or {}).get("nodes") or []:
            name = str((node.get("field") or {}).get("name") or "")
            if not name:
                continue
            if "text" in node:
                values[name] = node.get("text") or ""
            elif "number" in node:
                values[name] = node.get("number") or 0
            elif "name" in node:
                values[name] = node.get("name") or ""
        return values

    async def _set(self, project_id: str, item_id: str, field: dict, value: dict) -> None:
        mutation = """
        mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!) {
          updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}) {
            projectV2Item { id }
          }
        }
        """
        await self.api.graphql(
            mutation,
            {"project": project_id, "item": item_id, "field": field["id"], "value": value},
        )

    async def upsert(self, snapshot: ProjectSnapshot) -> dict[str, Any]:
        if snapshot.status not in AGENT_STATUSES:
            raise BoardRejected(f"unsupported Agent Status: {snapshot.status}")
        project = await self.project()
        fields = await self.ensure_fields(project)
        item, created = await self.ensure_item(project["id"], snapshot.issue_node_id)
        previous = self._values(item)
        previous_run = str(previous.get("Run ID") or "")
        previous_updated = str(previous.get("Updated At") or "")
        if previous_run and snapshot.run_id and previous_run != snapshot.run_id and previous_updated:
            if _stamp(snapshot.updated_at) <= _stamp(previous_updated):
                raise BoardRejected("stale run ID attempted to overwrite a newer Project item")

        status_options = {
            str(option["name"]): str(option["id"]) for option in fields["Agent Status"].get("options") or []
        }
        values: dict[str, Any] = {
            "Agent Status": {"singleSelectOptionId": status_options[snapshot.status]},
            "Issue Key": {"text": snapshot.issue_key[:200]},
            "Current Squad": {"text": snapshot.current_squad[:200]},
            "Updated At": {"text": snapshot.updated_at[:100]},
        }
        optional_text = {
            "Run ID": snapshot.run_id[:200],
            "Branch": snapshot.branch[:500],
            "PR URL": snapshot.pr_url[:1000],
            "Started At": snapshot.started_at[:100],
            "Doctor Warning": snapshot.doctor_warning[:1000],
            "Cleanup Status": snapshot.cleanup_status[:200],
        }
        values.update({name: {"text": value} for name, value in optional_text.items() if value})
        if snapshot.token_target:
            values["Token Target"] = {"number": float(snapshot.token_target)}
        if snapshot.token_spend:
            values["Token Spend"] = {"number": float(snapshot.token_spend)}
        changed: list[str] = []
        for name, value in values.items():
            plain = next(iter(value.values()))
            if previous.get(name) == plain and not created:
                continue
            await self._set(project["id"], item["id"], fields[name], value)
            changed.append(name)
        return {"item_id": item["id"], "created": created, "updated_fields": changed}
