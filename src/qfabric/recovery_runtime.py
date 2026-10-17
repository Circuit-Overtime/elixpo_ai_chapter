from __future__ import annotations

import platform
import subprocess
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol

from .profile_runner import _linux_invocation, _rt_invocation
from .profiling import Instrumentation
from .recovery import RecoveryController, RecoveryObservation
from .runtime import _connect_bridge


@dataclass(frozen=True, slots=True)
class ExecutionSample:
    outcome: str
    latency_ns: int | None
    injected_delay_ns: int = 0

    def __post_init__(self) -> None:
        if self.outcome not in {"ok", "error", "timeout"}:
            raise ValueError("unsupported execution outcome")
        if self.outcome == "ok" and self.latency_ns is None:
            raise ValueError("successful execution requires latency_ns")
        if self.latency_ns is not None and self.latency_ns < 0:
            raise ValueError("latency_ns must not be negative")
        if self.injected_delay_ns < 0:
            raise ValueError("injected_delay_ns must not be negative")


@dataclass(frozen=True, slots=True)
class ExecutionWindow:
    window_index: int
    domain: str
    epoch: int
    samples: tuple[ExecutionSample, ...]
    protected_contracts_healthy: bool
    in_flight_after: int

    def __post_init__(self) -> None:
        if self.window_index < 1:
            raise ValueError("window_index must be positive")
        if self.domain not in {"linux", "rt"}:
            raise ValueError("execution domain must be linux or rt")
        if self.epoch < 0:
            raise ValueError("epoch must not be negative")
        if not self.samples:
            raise ValueError("execution window requires samples")
        if self.in_flight_after < 0:
            raise ValueError("in_flight_after must not be negative")

    @property
    def safe_boundary(self) -> bool:
        return self.in_flight_after == 0

    def to_dict(self) -> dict[str, object]:
        return {
            "window_index": self.window_index,
            "domain": self.domain,
            "epoch": self.epoch,
            "samples": [asdict(sample) for sample in self.samples],
            "protected_contracts_healthy": self.protected_contracts_healthy,
            "in_flight_after": self.in_flight_after,
            "safe_boundary": self.safe_boundary,
        }


class PlacementBackend(Protocol):
    placement_domain: str
    epoch: int

    def execute_window(self, window_index: int) -> ExecutionWindow: ...

    def transition(self, domain: str, epoch: int) -> None: ...

    def close(self) -> None: ...


ObservationFactory = Callable[[ExecutionWindow, RecoveryController], RecoveryObservation]


class RecoveryExecutor:
    def __init__(
        self,
        controller: RecoveryController,
        backend: PlacementBackend,
        observation_factory: ObservationFactory,
    ):
        if backend.placement_domain != controller.current_domain:
            raise ValueError("backend and recovery controller domains do not match")
        if backend.epoch != controller.epoch:
            raise ValueError("backend and recovery controller epochs do not match")
        self.controller = controller
        self.backend = backend
        self.observation_factory = observation_factory
        self.windows: list[dict[str, object]] = []
        self.transitions: list[dict[str, object]] = []

    def run(self, maximum_windows: int) -> dict[str, object]:
        if maximum_windows < 1:
            raise ValueError("maximum_windows must be positive")
        try:
            for window_index in range(1, maximum_windows + 1):
                self._assert_synchronized()
                window = self.backend.execute_window(window_index)
                if window.domain != self.controller.current_domain:
                    raise RuntimeError("backend executed a window on the wrong domain")
                if window.epoch != self.controller.epoch:
                    raise RuntimeError("backend executed a window in the wrong epoch")
                observation = self.observation_factory(window, self.controller)
                if observation.safe_boundary != window.safe_boundary:
                    raise RuntimeError("recovery evidence disagrees with the invocation boundary")
                step = self.controller.add(observation)
                applied = []
                for action in step["actions"]:
                    if action["type"] not in {"switch", "rollback"}:
                        continue
                    if not window.safe_boundary or action.get("safe_boundary") is not True:
                        raise RuntimeError("domain transition attempted outside a safe boundary")
                    target = (
                        action["destination"]
                        if action["type"] == "switch"
                        else action["restored_domain"]
                    )
                    self.backend.transition(target, action["epoch"])
                    transition = {
                        "window_index": window_index,
                        "type": action["type"],
                        "domain": target,
                        "epoch": action["epoch"],
                        "safe_boundary": True,
                    }
                    self.transitions.append(transition)
                    applied.append(transition)
                self._assert_synchronized()
                self.windows.append(
                    {
                        "execution": window.to_dict(),
                        "recovery_step": step,
                        "applied_transitions": applied,
                    }
                )
        finally:
            self.backend.close()
        return {
            "schema_version": 1,
            "runtime": "boundary-safe-sequential-v1",
            "window_count": len(self.windows),
            "windows": self.windows,
            "transitions": self.transitions,
            "recovery": self.controller.report(),
        }

    def _assert_synchronized(self) -> None:
        if self.backend.placement_domain != self.controller.current_domain:
            raise RuntimeError("backend placement diverged from the recovery controller")
        if self.backend.epoch != self.controller.epoch:
            raise RuntimeError("backend epoch diverged from the recovery controller")


class DualDomainAddBackend:
    def __init__(
        self,
        root: Path,
        address: str,
        *,
        initial_domain: str,
        initial_epoch: int,
        invocations_per_window: int,
        timeout: float,
        injected_delay_ns: dict[int, int] | None = None,
        protected_probe: Callable[[int], bool] | None = None,
        protected_contracts_declared: bool = False,
    ):
        if initial_domain not in {"linux", "rt"}:
            raise ValueError("initial_domain must be linux or rt")
        if initial_epoch < 0:
            raise ValueError("initial_epoch must not be negative")
        if invocations_per_window < 1:
            raise ValueError("invocations_per_window must be positive")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        machine = platform.machine().lower()
        if machine not in {"aarch64", "arm64"}:
            raise RuntimeError(f"the recovery backend cannot execute on {machine}")
        self.artifact = root / "build/stage4/linux/qf-profile-linux"
        if not self.artifact.is_file():
            raise RuntimeError(f"Stage 4 Linux artifact is missing: {self.artifact}")
        self.bridge: Any = _connect_bridge(address)
        self.placement_domain = initial_domain
        self.epoch = initial_epoch
        self.invocations_per_window = invocations_per_window
        self.timeout = timeout
        self.injected_delay_ns = dict(injected_delay_ns or {})
        if any(window < 1 or delay < 0 for window, delay in self.injected_delay_ns.items()):
            raise ValueError("fault injection windows and delays must not be negative")
        self.protected_probe = protected_probe
        if protected_contracts_declared and protected_probe is None:
            raise ValueError("declared protected contracts require a health probe")
        self.protected_contracts_declared = protected_contracts_declared
        self.in_flight = 0
        self._counter = 1

    def execute_window(self, window_index: int) -> ExecutionWindow:
        samples = []
        delay_ns = self.injected_delay_ns.get(window_index, 0)
        for _ in range(self.invocations_per_window):
            invocation_id = (self.epoch << 32) | self._counter
            counter = self._counter
            self._counter += 1
            started_ns = time.perf_counter_ns()
            outcome = "ok"
            self.in_flight += 1
            try:
                if self.placement_domain == "linux":
                    _linux_invocation(
                        self.artifact,
                        invocation_id,
                        Instrumentation.FULL,
                        timeout=self.timeout,
                    )
                else:
                    _rt_invocation(
                        self.bridge,
                        self.epoch,
                        counter,
                        Instrumentation.FULL,
                        timeout=self.timeout,
                    )
                if delay_ns:
                    time.sleep(delay_ns / 1_000_000_000)
            except subprocess.TimeoutExpired:
                outcome = "timeout"
            except (OSError, RuntimeError, ValueError):
                outcome = "error"
            finally:
                self.in_flight -= 1
            finished_ns = time.perf_counter_ns()
            samples.append(
                ExecutionSample(
                    outcome=outcome,
                    latency_ns=finished_ns - started_ns if outcome == "ok" else None,
                    injected_delay_ns=delay_ns,
                )
            )
        protected_healthy = (
            not self.protected_contracts_declared
            if self.protected_probe is None
            else self.protected_probe(window_index)
        )
        return ExecutionWindow(
            window_index=window_index,
            domain=self.placement_domain,
            epoch=self.epoch,
            samples=tuple(samples),
            protected_contracts_healthy=protected_healthy,
            in_flight_after=self.in_flight,
        )

    def transition(self, domain: str, epoch: int) -> None:
        if self.in_flight != 0:
            raise RuntimeError("cannot transition while invocations are in flight")
        if domain not in {"linux", "rt"} or domain == self.placement_domain:
            raise ValueError("transition requires the alternate domain")
        if epoch != self.epoch + 1:
            raise ValueError("transition epoch must advance exactly once")
        self.placement_domain = domain
        self.epoch = epoch
        self._counter = 1

    def close(self) -> None:
        self.bridge.disconnect()
