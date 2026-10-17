"""UNO Q RGB status LEDs for Linux load and diffusion progress."""

from __future__ import annotations

from pathlib import Path


LED_PATHS = {
    1: {
        "red": Path("/sys/class/leds/red:user/brightness"),
        "green": Path("/sys/class/leds/green:user/brightness"),
        "blue": Path("/sys/class/leds/blue:user/brightness"),
    },
    2: {
        "red": Path("/sys/class/leds/red:panic/brightness"),
        "green": Path("/sys/class/leds/green:wlan/brightness"),
        "blue": Path("/sys/class/leds/blue:bt/brightness"),
    },
}


def load_color(load: float, *, memory: bool = False) -> tuple[bool, bool, bool]:
    """Return a coarse RGB traffic-light color for a normalized load."""
    load = max(0.0, min(1.0, load))
    if memory:
        if load < 0.50:
            return False, False, True  # blue
        if load < 0.75:
            return False, True, True  # cyan
        if load < 0.90:
            return True, True, False  # yellow
        return True, False, False  # red
    if load < 0.50:
        return False, True, False  # green
    if load < 0.80:
        return True, True, False  # yellow
    return True, False, False  # red


class StatusLeds:
    def __init__(self, display, enabled: bool = True):
        self.display = display
        self.enabled = enabled
        self.snapshot: dict[Path, str] = {}
        self.previous_cpu: tuple[int, int] | None = None
        self.available = enabled

    @staticmethod
    def _cpu_totals() -> tuple[int, int]:
        fields = Path("/proc/stat").read_text().splitlines()[0].split()[1:]
        values = [int(value) for value in fields]
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        return sum(values), idle

    @staticmethod
    def _memory_load() -> float:
        values = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value, *_ = line.replace(":", "").split()
            if key in {"MemTotal", "MemAvailable"}:
                values[key] = int(value)
        return 1.0 - values["MemAvailable"] / values["MemTotal"]

    def _write_led(self, led: int, color: tuple[bool, bool, bool]) -> None:
        for channel, value in zip(("red", "green", "blue"), color):
            LED_PATHS[led][channel].write_text("1\n" if value else "0\n")

    def __enter__(self) -> "StatusLeds":
        if not self.enabled:
            return self
        try:
            for channels in LED_PATHS.values():
                for path in channels.values():
                    self.snapshot[path] = path.read_text()
            self.previous_cpu = self._cpu_totals()
            self.display.set_led3_color(0, 0, 255)
            self.display.set_led4_color(False, False, True)
        except (OSError, KeyError, ValueError) as error:
            self.available = False
            print(f"status_leds=unavailable reason={error}", flush=True)
        return self

    def update(self, position: int, total_steps: int) -> tuple[float, float] | None:
        if not self.available:
            return None
        try:
            current_total, current_idle = self._cpu_totals()
            previous_total, previous_idle = self.previous_cpu or (current_total, current_idle)
            total_delta = current_total - previous_total
            cpu = 0.0 if total_delta <= 0 else 1.0 - (current_idle - previous_idle) / total_delta
            self.previous_cpu = current_total, current_idle
            memory = self._memory_load()
            self._write_led(1, load_color(cpu))
            self._write_led(2, load_color(memory, memory=True))
            progress = max(0.0, min(1.0, position / total_steps))
            self.display.set_led3_color(
                round(255 * progress),
                round(64 * progress),
                round(255 * (1.0 - progress)),
            )
            return cpu, memory
        except (OSError, KeyError, ValueError) as error:
            self.available = False
            print(f"status_leds=disabled reason={error}", flush=True)
            return None

    def finish(self, success: bool) -> None:
        if self.available:
            self.display.set_led3_color(255, 255, 255)
            self.display.set_led4_color(not success, success, False)

    def __exit__(self, error_type, *_args) -> None:
        if self.enabled and error_type is not None:
            try:
                self.display.set_led4_color(True, False, False)
            except Exception:
                pass
        for path, value in self.snapshot.items():
            try:
                path.write_text(value)
            except OSError:
                pass
