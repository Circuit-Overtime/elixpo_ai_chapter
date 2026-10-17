from __future__ import annotations

import json
import os
import struct
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LINUX_MACHINE_AARCH64 = 183


def _run(command: list[str], *, cwd: Path) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )
        return {
            "command": command,
            "exit_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }
    except FileNotFoundError:
        return {
            "command": command,
            "exit_code": 127,
            "stdout": "",
            "stderr": f"required executable is unavailable: {command[0]}",
        }


def _is_aarch64_elf(path: Path) -> bool:
    try:
        header = path.read_bytes()[:20]
    except OSError:
        return False
    return (
        len(header) >= 20
        and header[:4] == b"\x7fELF"
        and header[4] == 2
        and header[5] == 1
        and struct.unpack_from("<H", header, 18)[0] == LINUX_MACHINE_AARCH64
    )


def build_stage2(root: Path) -> dict[str, Any]:
    build_root = root / "build/stage2"
    linux_root = build_root / "linux"
    rt_root = build_root / "rt"
    linux_root.mkdir(parents=True, exist_ok=True)
    rt_root.mkdir(parents=True, exist_ok=True)

    linux_artifact = linux_root / "qf-add-linux"
    linux_compiler = os.environ.get("QF_ARM64_CXX", "aarch64-linux-gnu-g++")
    linux_command = [
        linux_compiler,
        "-std=c++20",
        "-O2",
        "-Wall",
        "-Wextra",
        "-Werror",
        str(root / "runtime/stage2/linux/qf_add_linux.cpp"),
        "-o",
        str(linux_artifact),
    ]
    linux_step = _run(linux_command, cwd=root)
    linux_architecture_ok = linux_step["exit_code"] == 0 and _is_aarch64_elf(linux_artifact)
    linux_step["artifact"] = str(linux_artifact.relative_to(root))
    linux_step["architecture"] = "aarch64" if linux_architecture_ok else "invalid-or-missing"
    linux_step["passed"] = linux_architecture_ok
    if linux_step["exit_code"] == 0 and not linux_architecture_ok:
        linux_step["stderr"] += "\nbuild output is not a 64-bit little-endian AArch64 ELF"

    arduino_cli = os.environ.get("QF_ARDUINO_CLI", "arduino-cli")
    sketch = root / "runtime/stage2/rt/qf_stage2_rt"
    include_flag = f"-I{root / 'qtasks'}"
    rt_command = [
        arduino_cli,
        "compile",
        "--fqbn",
        "arduino:zephyr:unoq",
        "--build-path",
        str(rt_root),
        "--build-property",
        f"compiler.cpp.extra_flags={include_flag}",
        str(sketch),
    ]
    rt_step = _run(rt_command, cwd=root)
    rt_binaries = sorted(rt_root.glob("*.elf-zsk.bin"))
    rt_passed = rt_step["exit_code"] == 0 and len(rt_binaries) == 1
    rt_step["artifacts"] = [str(path.relative_to(root)) for path in rt_binaries]
    rt_step["architecture"] = "cortex-m33-zephyr"
    rt_step["passed"] = rt_passed
    if rt_step["exit_code"] == 0 and not rt_passed:
        rt_step["stderr"] += "\nexpected one Cortex-M33 upload binary but found none or many"

    passed = linux_architecture_ok and rt_passed
    report: dict[str, Any] = {
        "schema_version": 1,
        "generated_utc": datetime.now(UTC).isoformat(),
        "stage": 2,
        "task": "add",
        "source_declaration": "qtasks/add.qtask.h",
        "status": "pass" if passed else "fail",
        "targets": {
            "linux": linux_step,
            "rt": rt_step,
        },
    }
    report_path = build_root / "build-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report["report"] = str(report_path.relative_to(root))
    return report
