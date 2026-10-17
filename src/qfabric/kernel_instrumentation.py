from __future__ import annotations

import ctypes
import errno
import fcntl
import json
import os
import platform
import select
import signal
import statistics
import struct
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .profile_runner import _linux_invocation
from .profiling import Instrumentation, summarize_metric

PERF_TYPE_SOFTWARE = 1
PERF_COUNT_SW_TASK_CLOCK = 1
PERF_COUNT_SW_CONTEXT_SWITCHES = 3
PERF_COUNT_SW_CPU_MIGRATIONS = 4
PERF_EVENT_IOC_ENABLE = 0x2400
PERF_EVENT_IOC_DISABLE = 0x2401
PERF_EVENT_IOC_RESET = 0x2403
PERF_IOC_FLAG_GROUP = 1

PERF_EVENTS = {
    "task_clock_ns": PERF_COUNT_SW_TASK_CLOCK,
    "context_switches": PERF_COUNT_SW_CONTEXT_SWITCHES,
    "cpu_migrations": PERF_COUNT_SW_CPU_MIGRATIONS,
}


class PerfEventAttr(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_uint32),
        ("size", ctypes.c_uint32),
        ("config", ctypes.c_uint64),
        ("sample_period", ctypes.c_uint64),
        ("sample_type", ctypes.c_uint64),
        ("read_format", ctypes.c_uint64),
        ("flags", ctypes.c_uint64),
        ("wakeup_events", ctypes.c_uint32),
        ("bp_type", ctypes.c_uint32),
        ("config1", ctypes.c_uint64),
        ("config2", ctypes.c_uint64),
        ("branch_sample_type", ctypes.c_uint64),
        ("sample_regs_user", ctypes.c_uint64),
        ("sample_stack_user", ctypes.c_uint32),
        ("clockid", ctypes.c_int32),
        ("sample_regs_intr", ctypes.c_uint64),
        ("aux_watermark", ctypes.c_uint32),
        ("sample_max_stack", ctypes.c_uint16),
        ("reserved2", ctypes.c_uint16),
        ("aux_sample_size", ctypes.c_uint32),
        ("reserved3", ctypes.c_uint32),
        ("sig_data", ctypes.c_uint64),
    ]


def _syscall_number(machine: str | None = None) -> int:
    architecture = (machine or platform.machine()).lower()
    if architecture in {"aarch64", "arm64"}:
        return 241
    if architecture in {"x86_64", "amd64"}:
        return 298
    raise OSError(errno.ENOSYS, f"perf_event_open syscall is unknown on {architecture}")


def _open_perf_event(
    config: int,
    *,
    group_fd: int = -1,
    pid: int = 0,
    inherit: bool = True,
    include_kernel: bool = False,
) -> int:
    attributes = PerfEventAttr()
    attributes.type = PERF_TYPE_SOFTWARE
    attributes.size = ctypes.sizeof(PerfEventAttr)
    attributes.config = config
    # disabled, optional inheritance, and no hypervisor measurements
    attributes.flags = (1 << 0) | (int(inherit) << 1) | (int(not include_kernel) << 5) | (1 << 6)
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.syscall(
        _syscall_number(),
        ctypes.byref(attributes),
        pid,
        -1,
        group_fd,
        0,
    )
    if result < 0:
        observed_errno = ctypes.get_errno()
        raise OSError(observed_errno, os.strerror(observed_errno))
    return int(result)


@dataclass(slots=True)
class PerfCounterGroup:
    descriptors: dict[str, int]

    @classmethod
    def open(
        cls,
        *,
        pid: int = 0,
        inherit: bool = True,
        include_kernel: bool = False,
    ) -> PerfCounterGroup:
        descriptors: dict[str, int] = {}
        try:
            for name, config in PERF_EVENTS.items():
                group_fd = next(iter(descriptors.values()), -1)
                descriptors[name] = _open_perf_event(
                    config,
                    group_fd=group_fd,
                    pid=pid,
                    inherit=inherit,
                    include_kernel=include_kernel,
                )
            return cls(descriptors)
        except OSError:
            for descriptor in descriptors.values():
                os.close(descriptor)
            raise

    @property
    def leader(self) -> int:
        return next(iter(self.descriptors.values()))

    def start(self) -> None:
        fcntl.ioctl(self.leader, PERF_EVENT_IOC_RESET, PERF_IOC_FLAG_GROUP)
        fcntl.ioctl(self.leader, PERF_EVENT_IOC_ENABLE, PERF_IOC_FLAG_GROUP)

    def stop(self) -> dict[str, int]:
        fcntl.ioctl(self.leader, PERF_EVENT_IOC_DISABLE, PERF_IOC_FLAG_GROUP)
        return {
            name: struct.unpack("Q", os.read(descriptor, 8))[0]
            for name, descriptor in self.descriptors.items()
        }

    def close(self) -> None:
        for descriptor in self.descriptors.values():
            os.close(descriptor)

    def __enter__(self) -> PerfCounterGroup:
        return self

    def __exit__(self, *_error: object) -> None:
        self.close()


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return None


def _is_file(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def _kernel_config() -> str:
    release = platform.release()
    return _read_text(Path(f"/boot/config-{release}")) or ""


def probe_kernel_capabilities() -> dict[str, object]:
    config = _kernel_config()
    schedstat = _read_text(Path("/proc/self/schedstat"))
    schedstat_fields = [] if schedstat is None else schedstat.split()
    perf_events: dict[str, dict[str, object]] = {}
    kernel_inclusive_events: dict[str, dict[str, object]] = {}
    for name, event in PERF_EVENTS.items():
        try:
            descriptor = _open_perf_event(event)
        except OSError as error:
            perf_events[name] = {
                "available": False,
                "errno": error.errno,
                "error": error.strerror,
            }
        else:
            os.close(descriptor)
            perf_events[name] = {"available": True, "errno": None, "error": None}
        try:
            descriptor = _open_perf_event(event, include_kernel=True)
        except OSError as error:
            kernel_inclusive_events[name] = {
                "available": False,
                "errno": error.errno,
                "error": error.strerror,
            }
        else:
            os.close(descriptor)
            kernel_inclusive_events[name] = {
                "available": True,
                "errno": None,
                "error": None,
            }

    trace_root = Path("/sys/kernel/tracing")
    debug_trace_root = Path("/sys/kernel/debug/tracing")
    scheduler_tracepoints = {
        name: any(
            _is_file(root / "events" / "sched" / name / "id")
            for root in (trace_root, debug_trace_root)
        )
        for name in ("sched_switch", "sched_wakeup", "sched_wakeup_new")
    }
    perf_available = all(item["available"] for item in perf_events.values())
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 10,
        "kernel": {
            "release": platform.release(),
            "architecture": platform.machine(),
            "perf_event_paranoid": _read_text(Path("/proc/sys/kernel/perf_event_paranoid")),
        },
        "measurement_gap": {
            "field": "Stage 4 queueing_ns",
            "deficiency": (
                "adjacent userspace timestamps measure profiler bookkeeping and cannot "
                "attribute end-to-end tails to on-CPU work, scheduler delay, or blocking"
            ),
        },
        "interfaces": {
            "perf_software_events": perf_events,
            "kernel_inclusive_perf_events": kernel_inclusive_events,
            "psi_cpu": _is_file(Path("/proc/pressure/cpu")),
            "process_schedstat": {
                "available": schedstat is not None,
                "wait_time_effective": (
                    len(schedstat_fields) >= 2
                    and int(schedstat_fields[1]) > 0
                ),
                "kernel_config_enabled": "CONFIG_SCHEDSTATS=y" in config,
            },
            "scheduler_tracepoints": scheduler_tracepoints,
            "btf": _is_file(Path("/sys/kernel/btf/vmlinux")),
        },
        "selection": {
            "mechanism": (
                "perf_event_open-software-counters" if perf_available else "userspace-only"
            ),
            "perf_available": perf_available,
            "kernel_inclusive_scheduler_events": all(
                kernel_inclusive_events[name]["available"]
                for name in ("context_switches", "cpu_migrations")
            ),
            "scheduler_event_privilege": "root-or-CAP_PERFMON",
            "wake_up_latency": "unavailable-with-stock-kernel",
            "cpu_pressure": "unavailable-CONFIG_PSI-disabled",
            "ebpf": "not-justified-no-scheduler-tracepoints-or-BTF",
            "custom_kernel_module": "not-introduced",
            "policy_location": "userspace",
            "fallback": "userspace-end-to-end-timing",
        },
    }


def _summaries(samples: list[dict[str, Any]]) -> dict[str, dict[str, int | float | None]]:
    names = (
        "end_to_end_ns",
        "task_clock_ns",
        "non_cpu_ns",
        "context_switches",
        "cpu_migrations",
    )
    return {
        name: summarize_metric(
            sample[name] for sample in samples if sample.get(name) is not None
        ).to_dict()
        for name in names
    }


def _parse_runner_output(output: str, invocation_id: int) -> None:
    fields = output.split()
    if len(fields) != 3:
        raise RuntimeError("Linux profile runner returned an invalid record")
    try:
        observed_id, result, _local_ns = (int(field, 10) for field in fields)
    except ValueError as error:
        raise RuntimeError("Linux profile runner returned non-integer data") from error
    if observed_id != invocation_id or result != 5:
        raise RuntimeError("Linux profile runner returned an invalid correlated result")


def _controlled_linux_invocation(
    artifact: Path,
    invocation_id: int,
    *,
    timeout: float,
    use_perf: bool,
    include_kernel: bool,
    injected_delay_ns: int,
) -> tuple[int, dict[str, int] | None]:
    read_fd, write_fd = os.pipe()
    child = os.fork()
    if child == 0:
        try:
            os.close(read_fd)
            os.dup2(write_fd, 1)
            os.dup2(write_fd, 2)
            os.close(write_fd)
            os.kill(os.getpid(), signal.SIGSTOP)
            if injected_delay_ns:
                time.sleep(injected_delay_ns / 1_000_000_000)
            os.execv(
                str(artifact),
                [str(artifact), str(invocation_id), "0", "2", "3"],
            )
        except BaseException:
            os._exit(127)

    os.close(write_fd)
    counter_group: PerfCounterGroup | None = None
    pid_fd: int | None = None
    reaped = False
    try:
        stopped_pid, status = os.waitpid(child, os.WUNTRACED)
        if stopped_pid != child or not os.WIFSTOPPED(status):
            raise RuntimeError("QTask child did not enter its controlled start boundary")
        pid_fd = os.pidfd_open(child)
        if use_perf:
            counter_group = PerfCounterGroup.open(
                pid=child,
                inherit=False,
                include_kernel=include_kernel,
            )
            counter_group.start()
        started = time.perf_counter_ns()
        os.kill(child, signal.SIGCONT)
        ready, _, _ = select.select([pid_fd], [], [], timeout)
        if not ready:
            os.kill(child, signal.SIGKILL)
            os.waitpid(child, 0)
            reaped = True
            raise TimeoutError("controlled Linux QTask timed out")
        observed_pid, status = os.waitpid(child, 0)
        reaped = True
        finished = time.perf_counter_ns()
        counters = None if counter_group is None else counter_group.stop()
        output = os.read(read_fd, 4096).decode("utf-8", errors="replace")
        if observed_pid != child or not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
            raise RuntimeError(f"controlled Linux QTask failed: {output.strip()}")
        _parse_runner_output(output, invocation_id)
        return finished - started, counters
    finally:
        if counter_group is not None:
            counter_group.close()
        if pid_fd is not None:
            os.close(pid_fd)
        if not reaped:
            try:
                os.kill(child, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(child, 0)
            except ChildProcessError:
                pass
        os.close(read_fd)


def run_kernel_benchmark(
    root: Path,
    *,
    iterations: int,
    warmup: int,
    timeout: float,
    force_fallback: bool = False,
    baseline: bool = False,
    include_kernel: bool = False,
    injected_delay_ns: int = 0,
) -> dict[str, object]:
    if iterations < 1 or warmup < 0:
        raise ValueError("kernel benchmark iterations must be positive and warmup nonnegative")
    if injected_delay_ns < 0:
        raise ValueError("kernel benchmark injected delay must not be negative")
    artifact = root / "build/stage4/linux/qf-profile-linux"
    if not artifact.is_file():
        raise ValueError(f"Linux profile artifact is missing: {artifact}")

    if force_fallback and baseline:
        raise ValueError("kernel benchmark cannot force fallback and baseline together")
    perf_available = False
    perf_error: str | None = "forced-unavailable" if force_fallback else None
    if not force_fallback and not baseline:
        try:
            probe = PerfCounterGroup.open(include_kernel=include_kernel)
        except OSError as error:
            perf_error = f"[{error.errno}] {error.strerror}"
        else:
            probe.close()
            perf_available = True

    samples: list[dict[str, object]] = []
    failures = 0
    for index in range(warmup + iterations):
        invocation_id = (int(time.time()) & 0xFFFFFFFF) << 32 | (index + 1)
        counters: dict[str, int] | None = None
        started = time.perf_counter_ns()
        try:
            if perf_available:
                end_to_end_ns, counters = _controlled_linux_invocation(
                    artifact,
                    invocation_id,
                    timeout=timeout,
                    use_perf=True,
                    include_kernel=include_kernel,
                    injected_delay_ns=injected_delay_ns,
                )
            elif baseline:
                end_to_end_ns, counters = _controlled_linux_invocation(
                    artifact,
                    invocation_id,
                    timeout=timeout,
                    use_perf=False,
                    include_kernel=False,
                    injected_delay_ns=injected_delay_ns,
                )
            else:
                _linux_invocation(
                    artifact,
                    invocation_id,
                    Instrumentation.DISABLED,
                    timeout=timeout,
                )
                end_to_end_ns = time.perf_counter_ns() - started
            outcome = "ok"
        except (OSError, RuntimeError):
            outcome = "error"
            failures += index >= warmup
        finished = time.perf_counter_ns()
        if index < warmup:
            continue
        if outcome != "ok":
            end_to_end_ns = finished - started
        task_clock_ns = None if counters is None else counters["task_clock_ns"]
        samples.append(
            {
                "sequence": index - warmup + 1,
                "outcome": outcome,
                "end_to_end_ns": end_to_end_ns,
                "task_clock_ns": task_clock_ns,
                "non_cpu_ns": (
                    None
                    if task_clock_ns is None
                    else max(end_to_end_ns - task_clock_ns, 0)
                ),
                "context_switches": (
                    None if counters is None else counters["context_switches"]
                ),
                "cpu_migrations": (
                    None if counters is None else counters["cpu_migrations"]
                ),
            }
        )

    successful = [sample for sample in samples if sample["outcome"] == "ok"]
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 10,
        "status": "pass" if failures == 0 else "fail",
        "mode": (
            "perf"
            if perf_available
            else "userspace-baseline" if baseline else "userspace-fallback"
        ),
        "configuration": {
            "iterations": iterations,
            "warmup": warmup,
            "timeout": timeout,
            "include_kernel": include_kernel,
            "injected_delay_ns": injected_delay_ns,
        },
        "perf_error": perf_error,
        "policy_location": "userspace",
        "successful_samples": len(successful),
        "failures": failures,
        "metrics": _summaries(successful),
        "samples": samples,
    }


def write_json_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def median_p95(reports: list[dict[str, Any]]) -> float:
    return statistics.median(report["metrics"]["end_to_end_ns"]["p95"] for report in reports)
