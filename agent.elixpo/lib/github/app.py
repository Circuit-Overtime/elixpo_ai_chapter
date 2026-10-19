"""GitHub App authentication — JWT generation and installation token exchange."""

from __future__ import annotations

import time

import httpx
import jwt
import structlog

from lib.config import settings

log = structlog.get_logger()

GITHUB_API = "https://api.github.com"


class GitHubApp:
    """Manages GitHub App identity and authentication.

    Flow:
      1. Generate a JWT signed with the App's private key
      2. Exchange the JWT for a short-lived installation access token
      3. Use the installation token for API calls scoped to that installation
    """

    def __init__(
        self,
        app_id: str | None = None,
        private_key: str | None = None,
    ):
        self.app_id = app_id or settings.github.app_id
        # PEM string preferred (CI secret); resolved_private_key() falls back to a file path.
        self._private_key: str | None = private_key or settings.github.resolved_private_key() or None
        self._installation_tokens: dict[int, tuple[str, float]] = {}  # id -> (token, expires_at)

    @property
    def private_key(self) -> str:
        if not self._private_key:
            raise RuntimeError(
                "no GitHub App private key — set ELIXPO_GH_PRIVATE_KEY (PEM) or "
                "ELIXPO_GH_PRIVATE_KEY_PATH in .env.local"
            )
        return self._private_key

    def generate_jwt(self) -> str:
        """Generate a JWT for authenticating as the GitHub App.

        JWTs are valid for up to 10 minutes. We use 9 minutes to be safe.
        """
        now = int(time.time())
        payload = {
            "iat": now - 60,  # issued at (60s in the past for clock drift)
            "exp": now + (9 * 60),  # expires in 9 minutes
            "iss": self.app_id,
        }
        token = jwt.encode(payload, self.private_key, algorithm="RS256")
        log.debug("github.jwt_generated", app_id=self.app_id)
        return token

    async def get_installation_token(self, installation_id: int) -> str:
        """Get an installation access token, using cache if still valid.

        Installation tokens are valid for 1 hour. We cache them and
        refresh when less than 5 minutes remain.
        """
        # Check cache
        if installation_id in self._installation_tokens:
            token, expires_at = self._installation_tokens[installation_id]
            if time.time() < expires_at - 300:  # 5 minute buffer
                return token

        # Exchange JWT for installation token
        app_jwt = self.generate_jwt()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        token = data["token"]
        # Parse expiration — GitHub returns ISO 8601
        from datetime import datetime
        expires_at_str = data.get("expires_at", "")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00")).timestamp()
        else:
            expires_at = time.time() + 3600  # fallback: 1 hour

        self._installation_tokens[installation_id] = (token, expires_at)
        log.info("github.installation_token_refreshed", installation_id=installation_id)
        return token

    async def get_app_info(self) -> dict:
        """Get information about the authenticated GitHub App."""
        app_jwt = self.generate_jwt()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API}/app",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def list_installations(self) -> list[dict]:
        """List all installations of this GitHub App."""
        app_jwt = self.generate_jwt()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API}/app/installations",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            return resp.json()
