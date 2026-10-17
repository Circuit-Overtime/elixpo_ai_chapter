from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from .visualization import (
    MATRIX_PIXELS,
    TaskTelemetry,
    ViewMode,
    VisualEvent,
    changed_pixels,
    frame_checksum,
    render_frame,
)


@dataclass(frozen=True, slots=True)
class FrameUpdate:
    decision_id: int
    mode: str
    frame: tuple[int, ...]
    changes: tuple[dict[str, int], ...]
    checksum: int


class VisualizationWorker:
    def __init__(
        self,
        *,
        refresh_hz: int = 8,
        capacity: int = 16,
        overlay_frames: int = 4,
    ):
        if not 5 <= refresh_hz <= 10:
            raise ValueError("visualization refresh_hz must be between 5 and 10")
        if capacity < 1 or overlay_frames < 1:
            raise ValueError("visualization capacity and overlay_frames must be positive")
        self.refresh_hz = refresh_hz
        self.interval_ns = 1_000_000_000 // refresh_hz
        self.capacity = capacity
        self.overlay_frames = overlay_frames
        self.mode = ViewMode.PLACEMENT
        self.queue: deque[TaskTelemetry] = deque()
        self.tasks: dict[int, TaskTelemetry] = {}
        self.previous = (0,) * MATRIX_PIXELS
        self.last_refresh_ns: int | None = None
        self.overlay: TaskTelemetry | None = None
        self.overlay_remaining = 0
        self.submitted = 0
        self.dropped = 0
        self.rendered = 0
        self.suppressed_unchanged = 0

    def set_mode(self, mode: ViewMode | str) -> None:
        self.mode = ViewMode(mode)
        if self.mode == ViewMode.OFF:
            self.queue.clear()
            self.overlay = None
            self.overlay_remaining = 0

    def submit(self, item: TaskTelemetry) -> None:
        self.submitted += 1
        if len(self.queue) == self.capacity:
            self.queue.popleft()
            self.dropped += 1
        self.queue.append(item)

    def poll(self, now_ns: int) -> FrameUpdate | None:
        if now_ns < 0:
            raise ValueError("visualization clock must not be negative")
        if (
            self.last_refresh_ns is not None
            and now_ns - self.last_refresh_ns < self.interval_ns
        ):
            return None
        self.last_refresh_ns = now_ns
        latest_by_slot = {}
        while self.queue:
            item = self.queue.popleft()
            latest_by_slot[item.slot] = item
        for item in latest_by_slot.values():
            self.tasks[item.slot] = item
            if item.event != VisualEvent.STABLE:
                self.overlay = item
                self.overlay_remaining = self.overlay_frames

        overlay = self.overlay if self.overlay_remaining else None
        current = render_frame(self.mode, list(self.tasks.values()), overlay=overlay)
        changes = changed_pixels(self.previous, current)
        if self.overlay_remaining:
            self.overlay_remaining -= 1
            if self.overlay_remaining == 0:
                self.overlay = None
        if not changes:
            self.suppressed_unchanged += 1
            return None
        self.previous = current
        self.rendered += 1
        decision_id = max((item.decision_id for item in self.tasks.values()), default=0)
        return FrameUpdate(
            decision_id=decision_id,
            mode=self.mode.value,
            frame=current,
            changes=tuple(changes),
            checksum=frame_checksum(current),
        )

    def diagnostics(self) -> dict[str, int | str]:
        return {
            "mode": self.mode.value,
            "refresh_hz": self.refresh_hz,
            "capacity": self.capacity,
            "queued": len(self.queue),
            "submitted": self.submitted,
            "dropped": self.dropped,
            "rendered": self.rendered,
            "suppressed_unchanged": self.suppressed_unchanged,
        }
