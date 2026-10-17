from __future__ import annotations

import platform
import subprocess
import time
from pathlib import Path
from typing import Any

from .profiling import (
    Instrumentation,
    InvocationSequencer,
    ProfileCollector,
    ProfileSample,
)
from .runtime import _connect_bridge

MODE_ID = {
    Instrumentation.DISABLED: 0,
    Instrumentation.REDUCED: 1,
    Instrumentation.FULL: 2,
}


def _linux_invocation(
    artifact: Path,
    invocation_id: int,
    mode: Instrumentation,
    *,
    timeout: float,
) -> tuple[int, int | None]:
    completed = subprocess.run(
        [str(artifact), str(invocation_id), str(MODE_ID[mode]), "2", "3"],
        text=True,
        capture_output=True,
        check=False,
        timeout=timeout,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or f"Linux runner exited {completed.returncode}"
        raise RuntimeError(detail)
    fields = completed.stdout.split()
    if len(fields) != 3:
        raise RuntimeError("Linux profile runner returned an invalid record")
    try:
        observed_id, result, local_ns = (int(field, 10) for field in fields)
    except ValueError as error:
        raise RuntimeError("Linux profile runner returned non-integer data") from error
    if observed_id != invocation_id:
        raise RuntimeError(
            f"Linux correlation mismatch: expected {invocation_id}, received {observed_id}"
        )
    if result != 5:
        raise RuntimeError(f"Linux add returned {result}; expected 5")
    return result, local_ns if mode is Instrumentation.FULL else None


def _rt_invocation(
    bridge: Any,
    epoch: int,
    invocation_counter: int,
    mode: Instrumentation,
    *,
    timeout: float,
) -> int:
    result = bridge.call(
        "qf_stage4_add_profiled",
        epoch,
        invocation_counter,
        2,
        3,
        MODE_ID[mode],
        timeout=timeout,
    )
    if result != 5:
        raise RuntimeError(f"RT add returned {result!r}; expected 5")
    return result


def _rt_diagnostics(
    bridge: Any,
    epoch: int,
    invocation_counter: int,
    mode: Instrumentation,
    *,
    timeout: float,
) -> int | None:
    observed_epoch = bridge.call("qf_stage4_diagnostic", 0, timeout=timeout)
    observed_counter = bridge.call("qf_stage4_diagnostic", 1, timeout=timeout)
    observed_mode = bridge.call("qf_stage4_diagnostic", 4, timeout=timeout)
    if (observed_epoch, observed_counter, observed_mode) != (
        epoch,
        invocation_counter,
        MODE_ID[mode],
    ):
        raise RuntimeError("RT diagnostic correlation mismatch")
    if mode is not Instrumentation.FULL:
        return None
    low = bridge.call("qf_stage4_diagnostic", 2, timeout=timeout)
    high = bridge.call("qf_stage4_diagnostic", 3, timeout=timeout)
    if not all(isinstance(value, int) and 0 <= value <= (1 << 32) - 1 for value in (low, high)):
        raise RuntimeError("RT local execution diagnostic is invalid")
    return (high << 32) | low


def run_profile_campaign(
    root: Path,
    address: str,
    *,
    domains: tuple[str, ...],
    modes: tuple[Instrumentation, ...],
    iterations: int,
    warmup: int,
    capacity: int,
    minimum_samples: int,
    deadline_ns: int,
    epoch: int,
    timeout: float,
) -> dict[str, object]:
    if iterations < 1:
        raise ValueError("iterations must be positive")
    if warmup < 0:
        raise ValueError("warmup must not be negative")
    if deadline_ns < 1:
        raise ValueError("deadline must be positive")
    if any(domain not in {"linux", "rt"} for domain in domains):
        raise ValueError("profile domains must be linux or rt")

    artifact = root / "build/stage4/linux/qf-profile-linux"
    if "linux" in domains:
        machine = platform.machine().lower()
        if machine not in {"aarch64", "arm64"}:
            raise RuntimeError(f"the Stage 4 Linux artifact cannot execute on {machine}")
        if not artifact.is_file():
            raise RuntimeError(f"Stage 4 Linux artifact is missing: {artifact}")

    collector = ProfileCollector(
        capacity=capacity,
        warmup=warmup,
        minimum_samples=minimum_samples,
    )
    sequencer = InvocationSequencer(epoch)
    bridge: Any | None = _connect_bridge(address) if "rt" in domains else None
    try:
        for domain in domains:
            for mode in modes:
                for _ in range(warmup + iterations):
                    invocation_id = sequencer.next()
                    counter = invocation_id & 0xFFFFFFFF
                    queued_ns = time.perf_counter_ns()
                    started_ns = time.perf_counter_ns()
                    outcome = "ok"
                    local_ns: int | None = None
                    finished_ns: int | None = None
                    try:
                        if domain == "linux":
                            _, local_ns = _linux_invocation(
                                artifact, invocation_id, mode, timeout=timeout
                            )
                        else:
                            assert bridge is not None
                            _rt_invocation(
                                bridge, epoch, counter, mode, timeout=timeout
                            )
                            finished_ns = time.perf_counter_ns()
                            local_ns = _rt_diagnostics(
                                bridge, epoch, counter, mode, timeout=timeout
                            )
                    except subprocess.TimeoutExpired:
                        outcome = "timeout"
                    except (OSError, RuntimeError, ValueError):
                        outcome = "error"
                    if finished_ns is None:
                        finished_ns = time.perf_counter_ns()
                    end_to_end_ns = finished_ns - started_ns
                    queueing_ns = started_ns - queued_ns
                    communication_ns = (
                        max(end_to_end_ns - local_ns, 0)
                        if mode is Instrumentation.FULL and local_ns is not None
                        else None
                    )
                    collector.add(
                        ProfileSample(
                            task="add",
                            task_id=1,
                            invocation_id=invocation_id,
                            epoch=epoch,
                            domain=domain,
                            instrumentation=mode,
                            outcome=outcome,
                            linux_started_ns=started_ns,
                            linux_finished_ns=finished_ns,
                            local_execution_ns=local_ns,
                            communication_ns=communication_ns,
                            queueing_ns=queueing_ns,
                            deadline_ns=deadline_ns,
                            deadline_met=outcome == "ok" and end_to_end_ns <= deadline_ns,
                            mcu_execution_us=(
                                local_ns // 1_000
                                if domain == "rt" and local_ns is not None
                                else None
                            ),
                        )
                    )
    finally:
        if bridge is not None:
            bridge.disconnect()

    report = collector.report()
    report["configuration"] = {
        "domains": list(domains),
        "instrumentation_modes": [mode.value for mode in modes],
        "iterations": iterations,
        "warmup": warmup,
        "capacity": capacity,
        "minimum_samples": minimum_samples,
        "deadline_ns": deadline_ns,
        "epoch": epoch,
    }
    return report
