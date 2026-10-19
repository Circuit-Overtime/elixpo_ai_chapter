"""Small GitHub Discussions GraphQL client.

GitHub does not expose Discussions through its REST API. This wrapper keeps the
GraphQL details out of squads and accepts an injected ``GitHubAPI`` for tests.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DiscussionCategory:
    id: str
    name: str
    slug: str


@dataclass(frozen=True)
class DiscussionLabel:
    id: str
    name: str


@dataclass(frozen=True)
class DiscussionPage:
    nodes: list[dict]
    end_cursor: str | None
    has_next_page: bool


class GitHubDiscussions:
    def __init__(self, api, owner: str, repo: str):
        self.api = api
        self.owner = owner
        self.repo = repo

    async def repository(self) -> dict:
        data = await self.api.graphql(
            """
            query($owner: String!, $repo: String!) {
              repository(owner: $owner, name: $repo) {
                id
                discussionCategories(first: 50) {
                  nodes { id name slug }
                }
              }
            }
            """,
            {"owner": self.owner, "repo": self.repo},
        )
        repository = data.get("repository")
        if not repository:
            raise RuntimeError(f"repository {self.owner}/{self.repo} was not found")
        return repository

    async def category(self, *aliases: str) -> DiscussionCategory:
        repository = await self.repository()
        wanted = {alias.casefold().replace("&", "and").replace(" ", "") for alias in aliases}
        for raw in repository["discussionCategories"]["nodes"]:
            values = (raw["name"], raw["slug"])
            normalized = {
                value.casefold().replace("&", "and").replace("-", "").replace(" ", "")
                for value in values
            }
            if wanted & normalized:
                return DiscussionCategory(id=raw["id"], name=raw["name"], slug=raw["slug"])
        available = ", ".join(node["name"] for node in repository["discussionCategories"]["nodes"])
        raise RuntimeError(f"missing discussion category {aliases[0]!r}; available: {available}")

    async def recent(self, limit: int = 30) -> list[dict]:
        data = await self.api.graphql(
            """
            query($owner: String!, $repo: String!, $limit: Int!) {
              repository(owner: $owner, name: $repo) {
                discussions(first: $limit, orderBy: {field: UPDATED_AT, direction: DESC}) {
                  nodes {
                    id number title body url createdAt category { name }
                    labels(first: 10) { nodes { name } }
                  }
                }
              }
            }
            """,
            {"owner": self.owner, "repo": self.repo, "limit": limit},
        )
        return data["repository"]["discussions"]["nodes"]

    async def recent_thread_page(self, limit: int = 20, cursor: str | None = None) -> DiscussionPage:
        """Fetch one updated-order Discussion page for round-robin mention polling."""
        data = await self.api.graphql(
            """
            query($owner: String!, $repo: String!, $limit: Int!, $cursor: String) {
              repository(owner: $owner, name: $repo) {
                discussions(first: $limit, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
                  nodes {
                    id number title body url createdAt author { login }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
            """,
            {"owner": self.owner, "repo": self.repo, "limit": limit, "cursor": cursor},
        )
        connection = data["repository"]["discussions"]
        page = connection["pageInfo"]
        return DiscussionPage(
            nodes=connection["nodes"],
            end_cursor=page.get("endCursor"),
            has_next_page=bool(page.get("hasNextPage")),
        )

    async def recent_threads(self, limit: int = 20) -> list[dict]:
        """Compatibility helper returning only the first thread page."""
        return (await self.recent_thread_page(limit=limit)).nodes

    async def comment_page(
        self, discussion_number: int, limit: int = 30, cursor: str | None = None
    ) -> DiscussionPage:
        """Fetch one oldest-first comment page, including bounded nested replies."""
        data = await self.api.graphql(
            """
            query($owner: String!, $repo: String!, $number: Int!, $limit: Int!, $cursor: String) {
              repository(owner: $owner, name: $repo) {
                discussion(number: $number) {
                  comments(first: $limit, after: $cursor) {
                    nodes {
                      id body createdAt author { login }
                      replies(first: 50) { nodes { id body createdAt author { login } } }
                    }
                    pageInfo { hasNextPage endCursor }
                  }
                }
              }
            }
            """,
            {
                "owner": self.owner,
                "repo": self.repo,
                "number": discussion_number,
                "limit": limit,
                "cursor": cursor,
            },
        )
        discussion = data["repository"].get("discussion")
        if not discussion:
            raise RuntimeError(f"discussion #{discussion_number} was not found")
        connection = discussion["comments"]
        page = connection["pageInfo"]
        return DiscussionPage(
            nodes=connection["nodes"],
            end_cursor=page.get("endCursor"),
            has_next_page=bool(page.get("hasNextPage")),
        )

    async def create(self, category_id: str, title: str, body: str) -> dict:
        repository = await self.repository()
        data = await self.api.graphql(
            """
            mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
              createDiscussion(input: {
                repositoryId: $repositoryId, categoryId: $categoryId,
                title: $title, body: $body
              }) { discussion { id number title url } }
            }
            """,
            {
                "repositoryId": repository["id"],
                "categoryId": category_id,
                "title": title,
                "body": body,
            },
        )
        return data["createDiscussion"]["discussion"]

    async def labels(self) -> list[DiscussionLabel]:
        """Return every label in the source repository, following pagination."""
        labels: list[DiscussionLabel] = []
        cursor = None
        while True:
            data = await self.api.graphql(
                """
                query($owner: String!, $repo: String!, $cursor: String) {
                  repository(owner: $owner, name: $repo) {
                    labels(first: 100, after: $cursor) {
                      nodes { id name }
                      pageInfo { hasNextPage endCursor }
                    }
                  }
                }
                """,
                {"owner": self.owner, "repo": self.repo, "cursor": cursor},
            )
            connection = data["repository"]["labels"]
            labels.extend(DiscussionLabel(id=node["id"], name=node["name"]) for node in connection["nodes"])
            page_info = connection["pageInfo"]
            if not page_info["hasNextPage"]:
                return labels
            cursor = page_info["endCursor"]

    async def ensure_labels(self, specs: dict[str, dict[str, str]]) -> list[DiscussionLabel]:
        """Resolve labels by name and create any missing deterministic labels."""
        repository = await self.repository()
        existing = {label.name.casefold(): label for label in await self.labels()}
        resolved: list[DiscussionLabel] = []
        for name, spec in specs.items():
            label = existing.get(name.casefold())
            if label is None:
                data = await self.api.graphql(
                    """
                    mutation(
                      $repositoryId: ID!, $name: String!, $color: String!, $description: String
                    ) {
                      createLabel(input: {
                        repositoryId: $repositoryId, name: $name,
                        color: $color, description: $description
                      }) { label { id name } }
                    }
                    """,
                    {
                        "repositoryId": repository["id"],
                        "name": name,
                        "color": spec["color"],
                        "description": spec.get("description", ""),
                    },
                )
                raw = data["createLabel"]["label"]
                label = DiscussionLabel(id=raw["id"], name=raw["name"])
                existing[name.casefold()] = label
            resolved.append(label)
        return resolved

    async def add_labels(self, discussion_id: str, label_ids: list[str]) -> None:
        """Apply repository labels to a Discussion through the Labelable interface."""
        if not label_ids:
            return
        await self.api.graphql(
            """
            mutation($discussionId: ID!, $labelIds: [ID!]!) {
              addLabelsToLabelable(input: {labelableId: $discussionId, labelIds: $labelIds}) {
                labelable { labels(first: 20) { nodes { id name } } }
              }
            }
            """,
            {"discussionId": discussion_id, "labelIds": label_ids},
        )

    async def comments(self, discussion_number: int, limit: int = 30) -> list[dict]:
        data = await self.api.graphql(
            """
            query($owner: String!, $repo: String!, $number: Int!, $limit: Int!) {
              repository(owner: $owner, name: $repo) {
                discussion(number: $number) {
                  comments(last: $limit) {
                    nodes {
                      id body createdAt author { login }
                      replies(last: 20) { nodes { id body createdAt author { login } } }
                    }
                  }
                }
              }
            }
            """,
            {"owner": self.owner, "repo": self.repo, "number": discussion_number, "limit": limit},
        )
        discussion = data["repository"].get("discussion")
        if not discussion:
            raise RuntimeError(f"discussion #{discussion_number} was not found")
        nodes = discussion["comments"]["nodes"]
        return [item for node in nodes for item in (node, *node["replies"]["nodes"])]

    async def add_comment(self, discussion_id: str, body: str, reply_to_id: str | None = None) -> dict:
        data = await self.api.graphql(
            """
            mutation($discussionId: ID!, $body: String!, $replyToId: ID) {
              addDiscussionComment(input: {
                discussionId: $discussionId, body: $body, replyToId: $replyToId
              }) { comment { id url } }
            }
            """,
            {"discussionId": discussion_id, "body": body, "replyToId": reply_to_id},
        )
        return data["addDiscussionComment"]["comment"]
