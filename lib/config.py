"""Configuration for elixpoo. Secrets load from .env.local at the repo root.

Var names match the existing .env.local (ELIXPO_LLM_*, ELIXPO_GITHUB_*). No
database, no server: state lives in GitHub issues, the Project board, and
state/*.json. See .env.example for the full list.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root = parent of lib/
ROOT = Path(__file__).resolve().parents[1]

# .env.local is the working secret file (gitignored). The tracked .env is the
# SOPS-encrypted copy and is not read directly.
_envfile = ROOT / ".env.local"
if _envfile.exists():
    load_dotenv(_envfile, override=False)


class PollinationsSettings(BaseSettings):
    """One key for all of Pollinations — text, image, embeddings."""

    model_config = SettingsConfigDict(extra="ignore")

    api_key: str = Field(default="", validation_alias="ELIXPO_POLLINATIONS_API_KEY")
    base_url: str = Field(default="https://gen.pollinations.ai/v1", validation_alias="ELIXPO_POLLINATIONS_BASE_URL")


class GitHubSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_id: str = Field(default="", validation_alias="ELIXPO_GITHUB_APP_ID")
    # PEM contents (preferred for CI); path is the local-dev fallback.
    private_key: str = Field(default="", validation_alias="ELIXPO_GITHUB_PRIVATE_KEY")
    private_key_path: str = Field(default="", validation_alias="ELIXPO_GITHUB_PRIVATE_KEY_PATH")
    webhook_secret: str = Field(default="", validation_alias="ELIXPO_GITHUB_WEBHOOK_SECRET")
    bot_username: str = Field(default="elixpoo", validation_alias="ELIXPO_GITHUB_BOT_USERNAME")
    # Control repo holding state/, candidate issues, the Project board (owner/name).
    control_repo: str = Field(default="", validation_alias="ELIXPO_GITHUB_CONTROL_REPO")
    fork_owner: str = Field(default="", validation_alias="ELIXPO_GITHUB_FORK_OWNER")
    # Plain token for REST/search; Actions sets GITHUB_TOKEN. For local runs, a PAT.
    token: str = Field(
        default="",
        validation_alias=AliasChoices("GITHUB_TOKEN", "ELIXPOO_GITHUB_AGENTIC_TOKEN"),
    )
    # Dedicated cross-owner credential for fork, push, and pull-request work.
    # Keep this separate from the narrower token used by read-oriented squads.
    solver_token: str = Field(default="", validation_alias="AGENT_GITHUB_SOLVER_TOKEN")
    # OAuth App (BYOP / login flows) — not needed by squads, kept for completeness.
    client_id: str = Field(default="", validation_alias="ELIXPO_GITHUB_CLIENT_ID")
    client_secret: str = Field(default="", validation_alias="ELIXPO_GITHUB_CLIENT_SECRET")

    def resolved_private_key(self) -> str:
        """PEM contents: the env string wins; otherwise read the file path (relative to repo root)."""
        if self.private_key.strip():
            return self.private_key
        if self.private_key_path:
            p = Path(self.private_key_path)
            if not p.is_absolute():
                p = ROOT / p
            if p.exists():
                return p.read_text()
        return ""


class UpstashSettings(BaseSettings):
    """Optional Redis cache (HTTP/REST). Absent → in-memory cache. Never state."""

    model_config = SettingsConfigDict(extra="ignore")

    url: str = Field(default="", validation_alias="ELIXPO_UPSTASH_URL")
    token: str = Field(default="", validation_alias="ELIXPO_UPSTASH_TOKEN")


class FollowupSettings(BaseSettings):
    """Shared GitHub follow-up memory; no database is involved."""

    model_config = SettingsConfigDict(extra="ignore")

    gist_token: str = Field(default="", validation_alias="ELIXPOO_GIST_AGENTIC_TOKEN")
    gist_id: str = Field(default="", validation_alias="ELIXPOO_FOLLOWUP_GIST_ID")
    ttl_days: int = Field(default=360, ge=60, le=360, validation_alias="ELIXPO_FOLLOWUP_TTL_DAYS")


class ProjectSettings(BaseSettings):
    """Dedicated GitHub Project V2 operations view."""

    model_config = SettingsConfigDict(extra="ignore")

    token: str = Field(default="", validation_alias="ELIXPOO_GITHUB_PROJECT_TOKEN")
    owner: str = Field(default="", validation_alias="ELIXPO_GITHUB_PROJECT_OWNER")
    number: int = Field(default=0, ge=0, validation_alias="ELIXPO_GITHUB_PROJECT_NUMBER")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    pollinations: PollinationsSettings = PollinationsSettings()
    github: GitHubSettings = GitHubSettings()
    upstash: UpstashSettings = UpstashSettings()
    followups: FollowupSettings = FollowupSettings()
    project: ProjectSettings = ProjectSettings()

    root: Path = ROOT
    config_dir: Path = ROOT / "config"
    state_dir: Path = ROOT / "state"
    prompts_dir: Path = ROOT / "prompts"

    debug: bool = Field(default=False, validation_alias="ELIXPO_DEBUG")


settings = Settings()
