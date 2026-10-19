"""GitHub REST API wrapper — authenticated requests scoped to installations."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

from lib.github.app import GitHubApp

log = structlog.get_logger()

GITHUB_API = "https://api.github.com"

_RETRY_STATUS = {502, 503, 504}
_MAX_RETRIES = 3


class GitHubAPI:
    """Authenticated GitHub API client.

    Two auth modes:
      - App installation: pass a GitHubApp + installation_id (acts as elixpoo[bot]).
      - Static token: GitHubAPI.from_token(GITHUB_TOKEN) for control-repo ops in CI.
    """

    def __init__(
        self,
        github_app: GitHubApp | None = None,
        installation_id: int | None = None,
        token: str | None = None,
    ):
        self._app = github_app
        self._installation_id = installation_id
        self._static_token = token
        self._client: httpx.AsyncClient | None = None
        self._client_token = ""
        self._client_lock = asyncio.Lock()

    @classmethod
    def from_token(cls, token: str) -> GitHubAPI:
        """Build a client from a plain token (e.g. Actions GITHUB_TOKEN)."""
        return cls(token=token)

    async def _token(self) -> str:
        if self._static_token:
            return self._static_token
        if self._app is None or self._installation_id is None:
            raise RuntimeError("GitHubAPI needs either a token or an app+installation_id")
        return await self._app.get_installation_token(self._installation_id)

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create an authenticated HTTP client."""
        token = await self._token()
        if self._client is not None and not self._client.is_closed and token == self._client_token:
            return self._client
        async with self._client_lock:
            if self._client is not None and not self._client.is_closed and token == self._client_token:
                return self._client
            if self._client is not None:
                await self._client.aclose()
            self._client = httpx.AsyncClient(
                base_url=GITHUB_API,
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=30.0,
            )
            self._client_token = token
            return self._client

    async def request_json_with_headers(self, method: str, path: str, **kwargs) -> tuple[Any, dict[str, str]]:
        """Return decoded JSON plus response headers for revision-sensitive APIs."""
        client = await self._get_client()
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await client.request(method, path, **kwargs)
                if resp.status_code in _RETRY_STATUS and attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(2**attempt)  # 1s, 2s backoff on transient 5xx
                    continue
                resp.raise_for_status()
                if resp.status_code == 204:
                    return None, dict(resp.headers)
                return resp.json(), dict(resp.headers)
            except (httpx.TransportError, httpx.TimeoutException) as e:
                last_exc = e
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(2**attempt)
                    continue
                raise
        if last_exc:
            raise last_exc

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        data, _headers = await self.request_json_with_headers(method, path, **kwargs)
        return data

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None
            self._client_token = ""

    async def graphql(self, query: str, variables: dict | None = None) -> dict:
        """Run an authenticated GitHub GraphQL request and surface schema errors."""
        data = await self._request(
            "POST",
            "/graphql",
            json={"query": query, "variables": variables or {}},
        )
        errors = data.get("errors", [])
        if errors:
            messages = "; ".join(str(error.get("message", error)) for error in errors)
            raise RuntimeError(f"GitHub GraphQL error: {messages}")
        return data.get("data", {})

    # --- Repositories ---

    async def get_repo(self, owner: str, repo: str) -> dict:
        return await self._request("GET", f"/repos/{owner}/{repo}")

    async def get_repo_contents(self, owner: str, repo: str, path: str = "", ref: str | None = None) -> list | dict:
        params = {}
        if ref:
            params["ref"] = ref
        return await self._request("GET", f"/repos/{owner}/{repo}/contents/{path}", params=params)

    async def get_tree(self, owner: str, repo: str, sha: str = "HEAD", recursive: bool = True) -> dict:
        params = {"recursive": "1"} if recursive else {}
        return await self._request("GET", f"/repos/{owner}/{repo}/git/trees/{sha}", params=params)

    async def get_default_branch(self, owner: str, repo: str) -> str:
        repo_data = await self.get_repo(owner, repo)
        return repo_data.get("default_branch", "main")

    async def list_org_repositories(self, owner: str) -> list[dict]:
        repositories: list[dict] = []
        page = 1
        while True:
            batch = await self._request(
                "GET",
                f"/orgs/{owner}/repos",
                params={"type": "all", "sort": "full_name", "per_page": 100, "page": page},
            )
            repositories.extend(batch or [])
            if len(batch or []) < 100:
                return repositories
            page += 1

    # --- Issues ---

    async def get_issue(self, owner: str, repo: str, issue_number: int) -> dict:
        return await self._request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}")

    async def get_issue_comments(self, owner: str, repo: str, issue_number: int) -> list:
        return await self._request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}/comments")

    async def create_issue_comment(self, owner: str, repo: str, issue_number: int, body: str) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
            json={"body": body},
        )

    async def update_issue_comment(self, owner: str, repo: str, comment_id: int, body: str) -> dict:
        return await self._request(
            "PATCH",
            f"/repos/{owner}/{repo}/issues/comments/{comment_id}",
            json={"body": body},
        )

    async def create_issue(
        self, owner: str, repo: str, title: str, body: str, *, labels: list[str] | None = None
    ) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/issues",
            json={"title": title, "body": body, "labels": labels or []},
        )

    async def update_issue(self, owner: str, repo: str, issue_number: int, **fields) -> dict:
        return await self._request(
            "PATCH", f"/repos/{owner}/{repo}/issues/{issue_number}", json=fields
        )

    async def ensure_label(
        self, owner: str, repo: str, name: str, color: str, description: str = ""
    ) -> None:
        try:
            await self._request("GET", f"/repos/{owner}/{repo}/labels/{name}")
        except Exception as exc:
            if getattr(getattr(exc, "response", None), "status_code", None) != 404:
                raise
            await self._request(
                "POST",
                f"/repos/{owner}/{repo}/labels",
                json={"name": name, "color": color, "description": description},
            )

    # --- Pull Requests ---

    async def get_pull(self, owner: str, repo: str, pr_number: int) -> dict:
        return await self._request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}")

    async def get_pull_diff(self, owner: str, repo: str, pr_number: int) -> str:
        """Get PR diff as text."""
        token = await self._token()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pr_number}",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github.v3.diff",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            return resp.text

    async def get_pull_files(self, owner: str, repo: str, pr_number: int) -> list:
        return await self._request(
            "GET",
            f"/repos/{owner}/{repo}/pulls/{pr_number}/files",
            params={"per_page": 100},
        )

    async def list_pulls(
        self,
        owner: str,
        repo: str,
        *,
        state: str = "closed",
        per_page: int = 30,
    ) -> list:
        return await self._request(
            "GET",
            f"/repos/{owner}/{repo}/pulls",
            params={"state": state, "sort": "updated", "direction": "desc", "per_page": per_page},
        )

    async def get_pull_comments(self, owner: str, repo: str, pr_number: int) -> list:
        return await self._request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}/comments")

    async def get_pull_reviews(self, owner: str, repo: str, pr_number: int) -> list:
        return await self._request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews")

    async def get_check_runs(self, owner: str, repo: str, ref: str) -> list:
        result = await self._request(
            "GET",
            f"/repos/{owner}/{repo}/commits/{ref}/check-runs",
            params={"per_page": 100},
        )
        return list((result or {}).get("check_runs") or [])

    async def create_pull(
        self,
        owner: str,
        repo: str,
        title: str,
        body: str,
        head: str,
        base: str,
    ) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls",
            json={
                "title": title,
                "body": body,
                "head": head,
                "base": base,
            },
        )

    async def create_pull_review(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        body: str,
        event: str = "COMMENT",  # APPROVE | REQUEST_CHANGES | COMMENT
    ) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews",
            json={"body": body, "event": event},
        )

    # --- Git refs / branches ---

    async def create_ref(self, owner: str, repo: str, ref: str, sha: str) -> dict:
        """Create a git reference (branch). ref should be 'refs/heads/branch-name'."""
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/git/refs",
            json={"ref": ref, "sha": sha},
        )

    async def get_commit(self, owner: str, repo: str, sha: str) -> dict:
        return await self._request("GET", f"/repos/{owner}/{repo}/git/commits/{sha}")

    async def create_blob(self, owner: str, repo: str, content: bytes) -> dict:
        import base64

        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/git/blobs",
            json={"content": base64.b64encode(content).decode(), "encoding": "base64"},
        )

    async def create_tree(self, owner: str, repo: str, base_tree: str, tree: list[dict]) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/git/trees",
            json={"base_tree": base_tree, "tree": tree},
        )

    async def create_commit(
        self, owner: str, repo: str, message: str, tree: str, parents: list[str]
    ) -> dict:
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/git/commits",
            json={"message": message, "tree": tree, "parents": parents},
        )

    async def get_ref(self, owner: str, repo: str, ref: str) -> dict:
        return await self._request("GET", f"/repos/{owner}/{repo}/git/ref/{ref}")

    # --- File operations via API (for small changes without cloning) ---

    async def create_or_update_file(
        self,
        owner: str,
        repo: str,
        path: str,
        content_b64: str,
        message: str,
        branch: str,
        sha: str | None = None,
    ) -> dict:
        payload: dict = {
            "message": message,
            "content": content_b64,
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        return await self._request(
            "PUT",
            f"/repos/{owner}/{repo}/contents/{path}",
            json=payload,
        )
