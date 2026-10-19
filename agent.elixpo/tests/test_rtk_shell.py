from __future__ import annotations

import subprocess

from rtk import shell


def _completed(args: list[str], code: int = 0, output: str = "ok") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=args, returncode=code, stdout=output, stderr="")


def test_rtk_selects_specialized_and_generic_adapters():
    assert shell._rtk_argv(["npx", "tsc", "--noEmit"]) == ["rtk", "npx", "tsc", "--noEmit"]
    assert shell._rtk_argv(["python", "-m", "pytest", "tests"]) == ["rtk", "pytest", "tests"]
    assert shell._rtk_argv(["python", "-m", "compileall", "."]) == [
        "rtk",
        "err",
        "python",
        "-m",
        "compileall",
        ".",
    ]
    assert shell._rtk_argv(["bwrap", "--", "npm", "ci"])[:2] == ["rtk", "err"]


def test_rtk_infrastructure_failure_retries_raw_command(monkeypatch):
    calls: list[list[str]] = []

    def fake_execute(cmd, **kwargs):
        calls.append(cmd)
        if cmd[0] == "rtk":
            return _completed(cmd, 1, "Failed to create stream fd: Operation not permitted")
        return _completed(cmd)

    monkeypatch.setattr(shell, "_has_rtk", lambda: True)
    monkeypatch.setattr(shell, "_execute", fake_execute)

    result = shell.run(["npm", "ci", "--ignore-scripts"])

    assert calls == [["rtk", "npm", "ci", "--ignore-scripts"], ["npm", "ci", "--ignore-scripts"]]
    assert result.code == 0
    assert result.compressed is False
