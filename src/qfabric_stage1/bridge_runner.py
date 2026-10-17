from __future__ import annotations

import time
import uuid
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, Protocol

from .model import Measurement

MATRIX_PROFILE_MODES = {"disabled": 0, "static": 1, "refresh": 2}


class BridgeClient(Protocol):
    def call(self, method: str, *args: Any, timeout: float = 5) -> Any: ...

    def provide(self, method: str, handler: Callable[..., Any]) -> None: ...

    def unprovide(self, method: str) -> None: ...


def check_bridge(bridge: BridgeClient, *, timeout: float) -> None:
    payload = "qfabric-health-check"
    value = bridge.call("qf_stage1_echo", payload, timeout=timeout)
    if value != payload:
        raise RuntimeError(f"Bridge health check returned an invalid result: {value!r}")


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def payload_for_size(size: int) -> str:
    if size < 0:
        raise ValueError("payload size cannot be negative")
    return "q" * size


def _measure_calls(
    bridge: BridgeClient,
    *,
    experiment: str,
    method: str,
    arguments: Callable[[int], tuple[Any, ...]],
    iterations: int,
    warmup: int,
    timeout: float,
    payload_bytes: int = 0,
    validate: Callable[[Any, int], bool] | None = None,
) -> Iterator[Measurement]:
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    if warmup < 0:
        raise ValueError("warmup cannot be negative")

    for sequence in range(-warmup, iterations):
        args = arguments(sequence)
        started_utc = utc_now()
        started_ns = time.perf_counter_ns()
        try:
            value = bridge.call(method, *args, timeout=timeout)
            latency_ns = time.perf_counter_ns() - started_ns
            valid = validate(value, sequence) if validate else True
            outcome = "ok" if valid else "invalid-result"
            detail = None if valid else repr(value)
            mcu_value = value if isinstance(value, int) and not isinstance(value, bool) else None
        except Exception as error:  # The error class depends on the installed Bridge package.
            latency_ns = time.perf_counter_ns() - started_ns
            outcome = "error"
            detail = f"{type(error).__name__}: {error}"
            mcu_value = None

        if sequence >= 0:
            yield Measurement(
                run_id="",  # Assigned by the public wrapper for a whole experiment run.
                experiment=experiment,
                sequence=sequence,
                started_utc=started_utc,
                latency_ns=latency_ns,
                outcome=outcome,
                payload_bytes=payload_bytes,
                mcu_value=mcu_value,
                detail=detail,
            )


def with_run_id(rows: Iterable[Measurement], run_id: str | None = None) -> Iterator[Measurement]:
    identifier = run_id or str(uuid.uuid4())
    for row in rows:
        yield Measurement(
            run_id=identifier,
            experiment=row.experiment,
            sequence=row.sequence,
            started_utc=row.started_utc,
            latency_ns=row.latency_ns,
            outcome=row.outcome,
            payload_bytes=row.payload_bytes,
            mcu_value=row.mcu_value,
            detail=row.detail,
            concurrency=row.concurrency,
            batch_elapsed_ns=row.batch_elapsed_ns,
            linux_started_ns=row.linux_started_ns,
            linux_finished_ns=row.linux_finished_ns,
        )


def roundtrip(
    bridge: BridgeClient,
    *,
    payload_size: int,
    iterations: int,
    warmup: int,
    timeout: float,
) -> Iterator[Measurement]:
    payload = payload_for_size(payload_size)
    rows = _measure_calls(
        bridge,
        experiment="rpc-roundtrip",
        method="qf_stage1_echo",
        arguments=lambda _sequence: (payload,),
        iterations=iterations,
        warmup=warmup,
        timeout=timeout,
        payload_bytes=len(payload.encode()),
        validate=lambda value, _sequence: value == payload,
    )
    return with_run_id(rows)


def concurrent_roundtrips(
    bridge: BridgeClient,
    *,
    payload_size: int,
    workers: int,
    iterations: int,
    warmup: int,
    timeout: float,
) -> Iterator[Measurement]:
    if workers <= 0:
        raise ValueError("workers must be positive")
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    if warmup < 0:
        raise ValueError("warmup cannot be negative")

    payload = payload_for_size(payload_size)

    def measure(sequence: int) -> Measurement:
        started_utc = utc_now()
        started_ns = time.perf_counter_ns()
        try:
            value = bridge.call("qf_stage1_echo", payload, timeout=timeout)
            latency_ns = time.perf_counter_ns() - started_ns
            valid = value == payload
            outcome = "ok" if valid else "invalid-result"
            detail = None if valid else repr(value)
        except Exception as error:
            latency_ns = time.perf_counter_ns() - started_ns
            outcome = "error"
            detail = f"{type(error).__name__}: {error}"

        return Measurement(
            run_id="",
            experiment=f"rpc-concurrency-{workers}",
            sequence=sequence,
            started_utc=started_utc,
            latency_ns=latency_ns,
            outcome=outcome,
            payload_bytes=len(payload.encode()),
            detail=detail,
            concurrency=workers,
        )

    def run_phase(executor: ThreadPoolExecutor, count: int, *, warmup_phase: bool):
        collected: list[Measurement] = []
        for offset in range(0, count, workers):
            batch_size = min(workers, count - offset)
            if warmup_phase:
                sequences = range(-count + offset, -count + offset + batch_size)
            else:
                sequences = range(offset, offset + batch_size)
            futures = [executor.submit(measure, sequence) for sequence in sequences]
            batch = [future.result() for future in futures]
            collected.extend(batch)
            if any(row.outcome != "ok" for row in batch):
                break
        return collected

    def measurements() -> Iterator[Measurement]:
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="qfabric-rpc") as executor:
            warmup_rows = run_phase(executor, warmup, warmup_phase=True)
            if any(row.outcome != "ok" for row in warmup_rows):
                raise RuntimeError("concurrency warmup failed; measured calls were not started")
            batch_started_ns = time.perf_counter_ns()
            measured_rows = run_phase(executor, iterations, warmup_phase=False)
            batch_elapsed_ns = time.perf_counter_ns() - batch_started_ns
            for row in measured_rows:
                yield replace(row, batch_elapsed_ns=batch_elapsed_ns)

    return with_run_id(measurements())


def clock_samples(
    bridge: BridgeClient, *, iterations: int, warmup: int, timeout: float
) -> Iterator[Measurement]:
    rows = _measure_calls(
        bridge,
        experiment="clock-sample",
        method="qf_stage1_micros",
        arguments=lambda _sequence: (),
        iterations=iterations,
        warmup=warmup,
        timeout=timeout,
        validate=lambda value, _sequence: isinstance(value, int),
    )
    return with_run_id(rows)


def clock_alignment_samples(
    bridge: BridgeClient,
    *,
    iterations: int,
    warmup: int,
    timeout: float,
    interval_ms: int,
) -> Iterator[Measurement]:
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    if warmup < 0:
        raise ValueError("warmup cannot be negative")
    if interval_ms < 0:
        raise ValueError("clock sample interval cannot be negative")

    def measurements() -> Iterator[Measurement]:
        for sequence in range(-warmup, iterations):
            started_utc = utc_now()
            linux_started_ns = time.perf_counter_ns()
            try:
                value = bridge.call("qf_stage1_micros", timeout=timeout)
                linux_finished_ns = time.perf_counter_ns()
                valid = isinstance(value, int) and not isinstance(value, bool) and value >= 0
                outcome = "ok" if valid else "invalid-result"
                detail = None if valid else repr(value)
                mcu_value = value if valid else None
            except Exception as error:
                linux_finished_ns = time.perf_counter_ns()
                outcome = "error"
                detail = f"{type(error).__name__}: {error}"
                mcu_value = None

            if sequence >= 0:
                yield Measurement(
                    run_id="",
                    experiment="clock-alignment",
                    sequence=sequence,
                    started_utc=started_utc,
                    latency_ns=linux_finished_ns - linux_started_ns,
                    outcome=outcome,
                    mcu_value=mcu_value,
                    detail=detail,
                    linux_started_ns=linux_started_ns,
                    linux_finished_ns=linux_finished_ns,
                )
                if sequence + 1 < iterations and interval_ms > 0:
                    time.sleep(interval_ms / 1000)

    return with_run_id(measurements())


def matrix_updates(
    bridge: BridgeClient, *, iterations: int, warmup: int, timeout: float
) -> Iterator[Measurement]:
    rows = _measure_calls(
        bridge,
        experiment="matrix-update",
        method="qf_stage1_matrix_draw",
        arguments=lambda sequence: (sequence & 0xFFFFFFFF,),
        iterations=iterations,
        warmup=warmup,
        timeout=timeout,
        validate=lambda value, _sequence: isinstance(value, int) and value >= 0,
    )
    return with_run_id(rows)


def configure_matrix_profile(
    bridge: BridgeClient, *, mode: str, refresh_hz: int, timeout: float
) -> None:
    if mode not in MATRIX_PROFILE_MODES:
        raise ValueError(f"unsupported matrix profile mode: {mode}")
    if mode == "refresh":
        if not 1 <= refresh_hz <= 120:
            raise ValueError("refresh profile rate must be between 1 and 120 Hz")
    elif refresh_hz != 0:
        raise ValueError("disabled and static matrix profiles require a zero refresh rate")

    configured = bridge.call(
        "qf_stage1_matrix_profile_configure",
        MATRIX_PROFILE_MODES[mode],
        refresh_hz,
        timeout=timeout,
    )
    if configured is not True:
        raise RuntimeError(
            f"MCU rejected matrix profile mode={mode!r}, refresh_hz={refresh_hz}"
        )


def matrix_profile_snapshot(bridge: BridgeClient, *, timeout: float) -> dict[str, int]:
    values = [
        _call_nonnegative_integer(
            bridge, "qf_stage1_matrix_profile_diagnostic", selector, timeout=timeout
        )
        for selector in range(4)
    ]
    return {
        "mode_id": values[0],
        "target_refresh_hz": values[1],
        "update_count": values[2],
        "maximum_draw_us": values[3],
    }


def matrix_profile_roundtrips(
    bridge: BridgeClient,
    *,
    mode: str,
    refresh_hz: int,
    payload_size: int,
    iterations: int,
    warmup: int,
    timeout: float,
) -> Iterator[Measurement]:
    if mode not in MATRIX_PROFILE_MODES:
        raise ValueError(f"unsupported matrix profile mode: {mode}")
    profile_name = mode if mode != "refresh" else f"refresh-{refresh_hz}hz"
    payload = payload_for_size(payload_size)
    rows = _measure_calls(
        bridge,
        experiment=f"led-profile-{profile_name}",
        method="qf_stage1_echo",
        arguments=lambda _sequence: (payload,),
        iterations=iterations,
        warmup=warmup,
        timeout=timeout,
        payload_bytes=len(payload.encode()),
        validate=lambda value, _sequence: value == payload,
    )
    return with_run_id(rows)


def _call_nonnegative_integer(
    bridge: BridgeClient, method: str, *arguments: Any, timeout: float
) -> int:
    value = bridge.call(method, *arguments, timeout=timeout)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise RuntimeError(f"{method} returned an invalid value: {value!r}")
    return value


def resource_snapshot(
    bridge: BridgeClient,
    *,
    timeout: float,
    reset_after: bool = False,
) -> dict[str, object]:
    constants = {
        "kernel_heap_capacity_bytes": _call_nonnegative_integer(
            bridge, "qf_stage1_resource_constant", 0, timeout=timeout
        ),
        "main_stack_capacity_bytes": _call_nonnegative_integer(
            bridge, "qf_stage1_resource_constant", 1, timeout=timeout
        ),
        "bridge_thread_stack_capacity_bytes": _call_nonnegative_integer(
            bridge, "qf_stage1_resource_constant", 2, timeout=timeout
        ),
        "rpc_decoder_buffer_bytes": _call_nonnegative_integer(
            bridge, "qf_stage1_resource_constant", 3, timeout=timeout
        ),
        "rpc_request_buffer_bytes": _call_nonnegative_integer(
            bridge, "qf_stage1_resource_constant", 4, timeout=timeout
        ),
    }
    capabilities = _call_nonnegative_integer(
        bridge, "qf_stage1_resource_constant", 5, timeout=timeout
    )

    diagnostics = {
        "requests_since_reset": _call_nonnegative_integer(
            bridge, "qf_stage1_diagnostic", 0, timeout=timeout
        ),
        "loop_iterations_since_reset": _call_nonnegative_integer(
            bridge, "qf_stage1_diagnostic", 1, timeout=timeout
        ),
        "maximum_loop_gap_us": _call_nonnegative_integer(
            bridge, "qf_stage1_diagnostic", 2, timeout=timeout
        ),
        "uptime_us_modulo_2_32": _call_nonnegative_integer(
            bridge, "qf_stage1_diagnostic", 3, timeout=timeout
        ),
    }

    if reset_after:
        reset = bridge.call("qf_stage1_reset_diagnostics", timeout=timeout)
        if reset is not True:
            raise RuntimeError(f"qf_stage1_reset_diagnostics returned an invalid result: {reset!r}")

    return {
        "schema_version": 1,
        "captured_utc": utc_now(),
        "constants": constants,
        "capabilities": {
            "stack_watermark": bool(capabilities & (1 << 0)),
            "system_heap_runtime_statistics": bool(capabilities & (1 << 1)),
            "thread_runtime_statistics": bool(capabilities & (1 << 2)),
        },
        "limitations": {
            "runtime_allocation_probe": "disabled-unsafe-on-stock-uno-q",
            "direct_routerbridge_queue_depth": "unavailable",
        },
        "diagnostics": diagnostics,
        "diagnostics_reset_after_capture": reset_after,
    }


def mcu_to_linux_roundtrips(
    bridge: BridgeClient, *, iterations: int, warmup: int, timeout: float
) -> Iterator[Measurement]:
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    if warmup < 0:
        raise ValueError("warmup cannot be negative")

    def linux_echo(token: int) -> int:
        return token

    def measurements() -> Iterator[Measurement]:
        bridge.provide("qf_stage1_linux_echo", linux_echo)
        try:
            for index in range(-warmup, iterations):
                token = index + warmup + 1
                started_utc = utc_now()
                started_ns = time.perf_counter_ns()
                try:
                    accepted = bridge.call("qf_stage1_reverse_start", token, timeout=timeout)
                    if accepted is not True:
                        raise RuntimeError(f"MCU rejected reverse token {token}")

                    deadline = time.monotonic() + timeout
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError(
                                f"MCU reverse result for token {token} timed out after {timeout}s"
                            )
                        duration_us = bridge.call(
                            "qf_stage1_reverse_result", token, timeout=remaining
                        )
                        if duration_us != -1:
                            break
                        time.sleep(min(0.001, remaining))

                    latency_ns = time.perf_counter_ns() - started_ns
                    valid = (
                        isinstance(duration_us, int)
                        and not isinstance(duration_us, bool)
                        and duration_us >= 0
                    )
                    outcome = "ok" if valid else "invalid-result"
                    detail = None if valid else repr(duration_us)
                    mcu_value = duration_us if valid else None
                except Exception as error:
                    latency_ns = time.perf_counter_ns() - started_ns
                    outcome = "error"
                    detail = f"{type(error).__name__}: {error}"
                    mcu_value = None

                if index >= 0:
                    yield Measurement(
                        run_id="",
                        experiment="mcu-linux-roundtrip",
                        sequence=index,
                        started_utc=started_utc,
                        latency_ns=latency_ns,
                        outcome=outcome,
                        mcu_value=mcu_value,
                        detail=detail,
                    )
        finally:
            bridge.unprovide("qf_stage1_linux_echo")

    return with_run_id(measurements())
