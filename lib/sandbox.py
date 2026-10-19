"""Optional OS boundary shared by squads that execute target-repository commands."""

from __future__ import annotations

import functools
import shutil
import subprocess
from pathlib import Path

_SYSTEM_ROOTS = (Path("/usr"), Path("/bin"), Path("/lib"), Path("/lib64"), Path("/opt"), Path("/etc"))
_NODE_TOOLS = {"node", "npm", "npx", "pnpm", "yarn", "bun", "biome", "tsc", "eslint"}


@functools.lru_cache(maxsize=1)
def bubblewrap_available() -> bool:
    executable = shutil.which("bwrap")
    if not executable:
        return False
    probe = subprocess.run(
        [executable, "--ro-bind", "/", "/", "--unshare-user", "--", "/bin/true"],
        capture_output=True,
        timeout=5,
        check=False,
    )
    return probe.returncode == 0


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def language_toolchain_roots(args: list[str]) -> list[Path]:
    """Resolve only the host toolchain roots required by this verification command."""
    if not args:
        return []
    names = [Path(args[0]).name]
    if names[0] in _NODE_TOOLS and "node" not in names:
        names.append("node")
    roots: list[Path] = []
    for name in names:
        executable = shutil.which(name)
        if not executable:
            continue
        path = Path(executable).absolute()
        resolved = path.resolve()
        if any(_inside(path, root) and _inside(resolved, root) for root in _SYSTEM_ROOTS):
            continue
        if name in _NODE_TOOLS:
            root = path.parent.parent
        elif path.parent.name == "bin":
            root = path.parent.parent
        else:
            root = path.parent
        if root != Path("/") and root not in roots:
            roots.append(root)
    return roots


def _create_mount_parents(command: list[str], root: Path, created: set[Path]) -> None:
    parents = list(reversed(root.parents))
    for parent in parents:
        if parent == Path("/") or any(parent == base or _inside(parent, base) for base in _SYSTEM_ROOTS):
            continue
        if parent not in created:
            command.extend(["--dir", str(parent)])
            created.add(parent)


def sandbox_command(workspace: Path, args: list[str], *, network: bool) -> tuple[list[str], str]:
    """Wrap argv in a workspace-only Linux sandbox when the host supports it."""
    executable = shutil.which("bwrap")
    if not executable or not bubblewrap_available():
        return args, "process"

    command = [
        executable,
        "--die-with-parent",
        "--new-session",
        "--unshare-user",
        "--unshare-pid",
        "--unshare-uts",
        "--unshare-ipc",
    ]
    if not network:
        command.append("--unshare-net")
    for path in _SYSTEM_ROOTS:
        if path.exists():
            command.extend(["--ro-bind", str(path), str(path)])
    created: set[Path] = set()
    for root in language_toolchain_roots(args):
        _create_mount_parents(command, root, created)
        command.extend(["--ro-bind", str(root), str(root)])
    command.extend(
        [
            "--proc",
            "/proc",
            "--dev",
            "/dev",
            "--tmpfs",
            "/tmp",
            "--dir",
            "/workspace",
            "--bind",
            str(workspace.resolve()),
            "/workspace",
        ]
    )
    git_dir = workspace / ".git"
    if git_dir.is_dir():
        command.extend(["--ro-bind", str(git_dir.resolve()), "/workspace/.git"])
    command.extend(["--chdir", "/workspace", "--", *args])
    return command, "bubblewrap"
