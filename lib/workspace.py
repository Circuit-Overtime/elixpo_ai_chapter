"""Isolated Git workspace operations with no shell interpolation."""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
from pathlib import Path


class WorkspaceError(RuntimeError):
    pass


def git_auth_env(token: str) -> dict[str, str]:
    """Pass GitHub auth through process environment, never command arguments."""
    env = os.environ.copy()
    if not token:
        return env
    encoded = base64.b64encode(f"x-access-token:{token}".encode()).decode()
    env.update(
        {
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader",
            "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {encoded}",
            "GIT_TERMINAL_PROMPT": "0",
        }
    )
    return env


class Workspace:
    def __init__(self, session_id: str, base_path: str | Path):
        if not session_id or any(
            ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for ch in session_id
        ):
            raise ValueError("workspace session_id contains unsafe characters")
        self.session_id = session_id
        self.base_path = Path(base_path).resolve()
        self.root = self.base_path / session_id

    def _run(
        self,
        args: list[str],
        *,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
        timeout: int = 120,
    ) -> str:
        proc = subprocess.run(
            args,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if proc.returncode != 0:
            raise WorkspaceError((proc.stderr or proc.stdout).strip()[:2000])
        return proc.stdout.strip()

    def setup(
        self,
        *,
        fork_url: str,
        upstream_url: str,
        base_branch: str,
        work_branch: str,
        token: str,
    ) -> Path:
        self.base_path.mkdir(parents=True, exist_ok=True)
        if self.root.exists():
            raise WorkspaceError(f"workspace already exists: {self.root}")
        env = git_auth_env(token)
        self._run(["git", "clone", "--filter=blob:none", "--no-tags", fork_url, str(self.root)], env=env)
        self._run(["git", "remote", "add", "upstream", upstream_url], cwd=self.root)
        self._run(["git", "fetch", "--depth", "1", "upstream", base_branch], cwd=self.root, env=env)
        self._run(["git", "checkout", "-b", work_branch, "FETCH_HEAD"], cwd=self.root)
        # Keep identity local to the isolated fork. GitHub links the commit and
        # avatar when this verified email belongs to the elixpoo account.
        self._run(["git", "config", "user.name", "elixpoo"], cwd=self.root)
        self._run(["git", "config", "user.email", "elixpoo@gmail.com"], cwd=self.root)
        return self.root

    def setup_existing_branch(
        self,
        *,
        fork_url: str,
        upstream_url: str,
        branch: str,
        token: str,
    ) -> Path:
        """Clone the recorded fork branch without creating or rebasing it."""
        self.base_path.mkdir(parents=True, exist_ok=True)
        if self.root.exists():
            raise WorkspaceError(f"workspace already exists: {self.root}")
        env = git_auth_env(token)
        self._run(
            [
                "git",
                "clone",
                "--filter=blob:none",
                "--no-tags",
                "--single-branch",
                "--branch",
                branch,
                fork_url,
                str(self.root),
            ],
            env=env,
        )
        self._run(["git", "remote", "add", "upstream", upstream_url], cwd=self.root)
        self._run(["git", "config", "user.name", "elixpoo"], cwd=self.root)
        self._run(["git", "config", "user.email", "elixpoo@gmail.com"], cwd=self.root)
        current = self._run(["git", "branch", "--show-current"], cwd=self.root)
        if current != branch:
            raise WorkspaceError(f"workspace branch is {current}, expected {branch}")
        return self.root

    def cleanup(self) -> None:
        if self.root.is_dir() and self.root.parent == self.base_path:
            shutil.rmtree(self.root)

    def exists(self) -> bool:
        return self.root.is_dir()
