"""Idempotent Project V2 records for Elixpoo v2 triage."""

from __future__ import annotations

from typing import Any


class ProjectRecordError(RuntimeError):
    pass


class ProjectRecords:
    """Add one issue/PR to a configured Project and update managed fields."""

    def __init__(self, api, owner: str, number: int):
        if not owner or number <= 0:
            raise ValueError("Project owner and positive project number are required")
        self.api = api
        self.owner = owner
        self.number = number

    async def _project(self) -> dict[str, Any]:
        query = """
        query($owner:String!,$number:Int!) {
          repositoryOwner(login:$owner) {
            ... on Organization { projectV2(number:$number) { id fields(first:100) { nodes {
              __typename
              ... on ProjectV2Field { id name dataType }
              ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            } } } }
            ... on User { projectV2(number:$number) { id fields(first:100) { nodes {
              __typename
              ... on ProjectV2Field { id name dataType }
              ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            } } } }
          }
        }
        """
        data = await self.api.graphql(query, {"owner": self.owner, "number": self.number})
        project = (data.get("repositoryOwner") or {}).get("projectV2")
        if not project:
            raise ProjectRecordError(f"Project {self.owner}/{self.number} was not found")
        return project

    async def _item(self, project_id: str, content_id: str) -> tuple[str, bool]:
        cursor = None
        while True:
            data = await self.api.graphql(
                """
                query($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2 {
                  items(first:100,after:$cursor) {
                    nodes { id content { ... on Issue { id } ... on PullRequest { id } } }
                    pageInfo { hasNextPage endCursor } }
                } } }
                """,
                {"id": project_id, "cursor": cursor},
            )
            connection = (data.get("node") or {}).get("items") or {}
            for item in connection.get("nodes") or []:
                if str((item.get("content") or {}).get("id") or "") == content_id:
                    return str(item["id"]), False
            page = connection.get("pageInfo") or {}
            if not page.get("hasNextPage"):
                break
            cursor = page.get("endCursor")
        data = await self.api.graphql(
            "mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}",
            {"project": project_id, "content": content_id},
        )
        item = (data.get("addProjectV2ItemById") or {}).get("item") or {}
        if not item.get("id"):
            raise ProjectRecordError("GitHub did not add the item to the Project")
        return str(item["id"]), True

    async def _set(self, project: str, item: str, field: str, value: dict[str, Any]) -> None:
        await self.api.graphql(
            """
            mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!) {
              updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}) {
                projectV2Item { id }
              }
            }
            """,
            {"project": project, "item": item, "field": field, "value": value},
        )

    async def upsert(self, *, content_id: str, repository: str, values: dict[str, str]) -> dict[str, Any]:
        if not content_id:
            raise ProjectRecordError("GitHub event did not include an issue or pull-request node ID")
        project = await self._project()
        item_id, created = await self._item(str(project["id"]), content_id)
        fields = {
            str(field.get("name") or "").casefold(): field
            for field in ((project.get("fields") or {}).get("nodes") or [])
            if field and field.get("id")
        }
        requested = {"repository": repository, **values}
        updated: list[str] = []
        unavailable: list[str] = []
        for name, raw in requested.items():
            field = fields.get(name.casefold())
            if not field:
                unavailable.append(name)
                continue
            if str(field.get("dataType")) == "SINGLE_SELECT":
                option = next(
                    (
                        option
                        for option in field.get("options") or []
                        if str(option.get("name") or "").casefold() == raw.casefold()
                    ),
                    None,
                )
                if not option:
                    unavailable.append(f"{name}={raw}")
                    continue
                value = {"singleSelectOptionId": option["id"]}
            else:
                value = {"text": raw[:1024]}
            await self._set(str(project["id"]), item_id, str(field["id"]), value)
            updated.append(name)
        return {"item_id": item_id, "created": created, "updated_fields": updated, "unavailable_fields": unavailable}
