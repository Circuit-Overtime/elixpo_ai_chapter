"""PulseAudio/PipeWire routing backend used by the GUI and CLI."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol


CAPTURE_SINK = "screenbridge_capture"
SYSTEM_SOURCE = "screenbridge_system_audio"
MIX_SINK = "screenbridge_mix"
MIX_SOURCE = "screenbridge_system_and_mic"


class AudioError(RuntimeError):
    """A user-facing audio routing error."""


@dataclass(frozen=True)
class Device:
    name: str
    description: str
    index: int


@dataclass
class SessionState:
    output: str
    microphone: str
    previous_default_sink: str
    mixed: bool
    modules: list[int] = field(default_factory=list)
    moved_inputs: dict[str, str] = field(default_factory=dict)


class Runner(Protocol):
    def __call__(self, args: list[str]) -> str: ...


def _run(args: list[str]) -> str:
    try:
        result = subprocess.run(
            args,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise AudioError(
            "pactl is not installed. Install the 'pulseaudio-utils' package and try again."
        ) from exc
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or exc.stdout.strip() or "unknown pactl error"
        raise AudioError(message) from exc
    return result.stdout.strip()


class Pactl:
    def __init__(self, runner: Runner = _run) -> None:
        self._runner = runner

    def call(self, *args: str) -> str:
        return self._runner(["pactl", *args])

    def json_list(self, kind: str) -> list[dict[str, Any]]:
        raw = self.call("--format=json", "list", kind)
        try:
            value = json.loads(raw or "[]")
        except json.JSONDecodeError as exc:
            raise AudioError("The audio server returned an unreadable response.") from exc
        if not isinstance(value, list):
            raise AudioError("The audio server returned an unexpected response.")
        return value

    def info(self) -> dict[str, str]:
        result: dict[str, str] = {}
        for line in self.call("info").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                result[key.strip()] = value.strip()
        return result

    def devices(self, kind: str) -> list[Device]:
        devices: list[Device] = []
        for item in self.json_list(kind):
            name = str(item.get("name", ""))
            if not name:
                continue
            properties = item.get("properties") or {}
            description = str(properties.get("device.description") or item.get("description") or name)
            devices.append(Device(name, description, int(item.get("index", -1))))
        return devices

    def load_module(self, name: str, *arguments: str) -> int:
        output = self.call("load-module", name, *arguments)
        try:
            return int(output)
        except ValueError as exc:
            raise AudioError(f"Could not load {name}: unexpected module id {output!r}") from exc


class AudioRouter:
    def __init__(self, pactl: Pactl | None = None, state_path: Path | None = None) -> None:
        self.pactl = pactl or Pactl()
        default_state = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
        self.state_path = state_path or default_state / "screenbridge" / "session.json"

    def ensure_available(self) -> None:
        if shutil.which("pactl") is None:
            raise AudioError("pactl is required. Install it with: sudo apt install pulseaudio-utils")
        info = self.pactl.info()
        if not info.get("Server Name"):
            raise AudioError("No PipeWire or PulseAudio server is available for this user session.")

    def outputs(self) -> list[Device]:
        return [device for device in self.pactl.devices("sinks") if not device.name.startswith("screenbridge_")]

    def microphones(self) -> list[Device]:
        return [
            device
            for device in self.pactl.devices("sources")
            if not device.name.endswith(".monitor") and not device.name.startswith("screenbridge_")
        ]

    def active_state(self) -> SessionState | None:
        try:
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            return SessionState(**raw)
        except FileNotFoundError:
            return None
        except (json.JSONDecodeError, TypeError):
            raise AudioError(f"Session state is damaged: {self.state_path}")

    def _save(self, state: SessionState) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")
        temporary.replace(self.state_path)

    def _remove_state(self) -> None:
        self.state_path.unlink(missing_ok=True)

    def _sink_inputs(self) -> list[dict[str, Any]]:
        return self.pactl.json_list("sink-inputs")

    @staticmethod
    def _sink_index_map(sinks: list[Device]) -> dict[int, str]:
        return {sink.index: sink.name for sink in sinks}

    def start(self, output: str, microphone: str, mixed: bool = False) -> SessionState:
        if self.active_state() is not None:
            raise AudioError("A ScreenBridge session is already active. Stop it before starting another.")

        outputs = self.outputs()
        microphones = self.microphones()
        if output not in {device.name for device in outputs}:
            raise AudioError("The selected playback device is no longer available.")
        if microphone not in {device.name for device in microphones}:
            raise AudioError("The selected microphone is no longer available.")

        previous_default = self.pactl.info().get("Default Sink", output)
        sink_names = self._sink_index_map(outputs)
        existing_inputs: dict[str, str] = {}
        for item in self._sink_inputs():
            sink_index = int(item.get("sink", -1))
            if sink_names.get(sink_index) == output:
                existing_inputs[str(item["index"])] = output

        state = SessionState(output, microphone, previous_default, mixed)
        try:
            state.modules.append(
                self.pactl.load_module(
                    "module-null-sink",
                    f"sink_name={CAPTURE_SINK}",
                    'sink_properties=device.description="ScreenBridge Capture"',
                )
            )
            self._save(state)
            state.modules.append(
                self.pactl.load_module(
                    "module-loopback",
                    f"source={CAPTURE_SINK}.monitor",
                    f"sink={output}",
                    "latency_msec=20",
                    "source_dont_move=true",
                    "sink_dont_move=true",
                )
            )
            self._save(state)
            state.modules.append(
                self.pactl.load_module(
                    "module-remap-source",
                    f"master={CAPTURE_SINK}.monitor",
                    f"source_name={SYSTEM_SOURCE}",
                    'source_properties=device.description="Screen Share Audio"',
                )
            )
            self._save(state)

            if mixed:
                state.modules.append(
                    self.pactl.load_module(
                        "module-null-sink",
                        f"sink_name={MIX_SINK}",
                        'sink_properties=device.description="ScreenBridge Mix Bus"',
                    )
                )
                self._save(state)
                for source in (f"{CAPTURE_SINK}.monitor", microphone):
                    state.modules.append(
                        self.pactl.load_module(
                            "module-loopback",
                            f"source={source}",
                            f"sink={MIX_SINK}",
                            "latency_msec=20",
                            "source_dont_move=true",
                            "sink_dont_move=true",
                        )
                    )
                    self._save(state)
                state.modules.append(
                    self.pactl.load_module(
                        "module-remap-source",
                        f"master={MIX_SINK}.monitor",
                        f"source_name={MIX_SOURCE}",
                        'source_properties=device.description="Screen Share Audio + Microphone"',
                    )
                )
                self._save(state)

            self.pactl.call("set-default-sink", CAPTURE_SINK)
            for input_id, old_sink in existing_inputs.items():
                self.pactl.call("move-sink-input", input_id, CAPTURE_SINK)
                state.moved_inputs[input_id] = old_sink
                self._save(state)
            return state
        except Exception:
            # State is updated after each module so even partial setup is recoverable.
            self._save(state)
            self.stop()
            raise

    def stop(self) -> None:
        state = self.active_state()
        if state is None:
            return

        errors: list[str] = []
        capture: Device | None = None
        owns_live_devices = False
        try:
            sinks = self.pactl.devices("sinks")
            sources = self.pactl.devices("sources")
            capture = next((sink for sink in sinks if sink.name == CAPTURE_SINK), None)
            owns_live_devices = capture is not None or any(
                source.name in {SYSTEM_SOURCE, MIX_SOURCE} for source in sources
            )
        except AudioError as exc:
            errors.append(str(exc))

        try:
            self.pactl.call("set-default-sink", state.previous_default_sink)
        except AudioError as exc:
            errors.append(str(exc))

        # Move every app still using our capture sink. Module loopbacks target other sinks.
        try:
            if capture is not None:
                for item in self._sink_inputs():
                    if int(item.get("sink", -1)) == capture.index:
                        try:
                            self.pactl.call("move-sink-input", str(item["index"]), state.output)
                        except AudioError as exc:
                            errors.append(str(exc))
        except AudioError as exc:
            errors.append(str(exc))

        remaining: list[int] = []
        if owns_live_devices:
            for module_id in reversed(state.modules):
                try:
                    self.pactl.call("unload-module", str(module_id))
                except AudioError as exc:
                    # A missing module is harmless after an audio-server restart.
                    if "No such entity" not in str(exc):
                        errors.append(str(exc))
                        remaining.append(module_id)

        if remaining:
            state.modules = list(reversed(remaining))
            self._save(state)
        else:
            self._remove_state()
        if errors:
            raise AudioError("Some audio routes could not be restored: " + "; ".join(errors))
