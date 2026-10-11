"""Bridge adapter for the STM32-owned UNO Q LED matrix."""

from __future__ import annotations

import time


class MatrixDisplay:
    def __init__(
        self,
        timeout: float = 5.0,
        ready_timeout: float = 120.0,
        retry_interval: float = 0.5,
    ):
        from arduino.router_bridge import Bridge

        self.timeout = timeout
        self.ready_timeout = ready_timeout
        self.retry_interval = retry_interval
        self.bridge = Bridge()

    def __enter__(self) -> "MatrixDisplay":
        deadline = time.monotonic() + self.ready_timeout
        attempts = 0
        last_error = None
        while True:
            attempts += 1
            try:
                if self.bridge.connect(timeout=self.timeout):
                    if attempts > 1:
                        print(
                            f"bridge=connected attempts={attempts}",
                            flush=True,
                        )
                    return self
                last_error = RuntimeError("Bridge.connect returned false")
            except Exception as error:
                last_error = error

            if attempts == 1:
                print("bridge=waiting_for_router", flush=True)
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    "Arduino Router did not become available before the startup timeout"
                ) from last_error
            time.sleep(self.retry_interval)

    def _call(self, method: str, *parameters):
        deadline = time.monotonic() + self.ready_timeout
        while True:
            try:
                return self.bridge.call(method, *parameters, timeout=self.timeout)
            except Exception as error:
                # The Linux router socket becomes available before a freshly
                # flashed sketch has necessarily registered its RPC methods.
                # Treat that short window as startup, not a fatal missing-
                # firmware error.
                if f"method {method} not available" not in str(error):
                    raise
                if time.monotonic() >= deadline:
                    raise RuntimeError(
                        f"STM32 {method} RPC did not become ready; verify the Diffuino sketch is running"
                    ) from error
                time.sleep(0.25)

    def draw(self, payload: bytes) -> None:
        self._call("draw", payload)

    def set_led3_color(self, red: int, green: int, blue: int) -> None:
        self._call("set_led3_color", red, green, blue)

    def set_led4_color(self, red: bool, green: bool, blue: bool) -> None:
        self._call("set_led4_color", red, green, blue)

    def selector_ready(self) -> None:
        self._call("selector_ready")

    def poll_digit(self) -> int:
        return int(self._call("poll_digit"))

    def complete_request(self, success: bool) -> None:
        self._call("complete_request", success)

    def clear(self) -> None:
        self.draw(bytes(104))

    def __exit__(self, *_args) -> None:
        self.bridge.disconnect()
