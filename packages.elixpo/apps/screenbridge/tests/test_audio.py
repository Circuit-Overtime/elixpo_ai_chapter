import json
import tempfile
import unittest
from pathlib import Path

from screenbridge.audio import AudioError, AudioRouter, CAPTURE_SINK


class FakePactl:
    def __init__(self):
        self.calls = []
        self.module_id = 100
        self.capture_present = False
        self.sink_inputs = [{"index": 44, "sink": 1}]

    def info(self):
        return {"Server Name": "PulseAudio (on PipeWire)", "Default Sink": "speaker", "Default Source": "mic"}

    def devices(self, kind):
        from screenbridge.audio import Device

        if kind == "sinks":
            result = [Device("speaker", "Speakers", 1)]
            if self.capture_present:
                result.append(Device(CAPTURE_SINK, "Capture", 9))
            return result
        return [Device("mic", "Microphone", 2)]

    def json_list(self, kind):
        assert kind == "sink-inputs"
        return list(self.sink_inputs)

    def load_module(self, name, *args):
        self.module_id += 1
        self.calls.append(("load-module", name, *args))
        if any(f"sink_name={CAPTURE_SINK}" == arg for arg in args):
            self.capture_present = True
        return self.module_id

    def call(self, *args):
        self.calls.append(args)
        if args[:2] == ("move-sink-input", "44"):
            self.sink_inputs[0]["sink"] = 9 if args[2] == CAPTURE_SINK else 1
        if args[0] == "unload-module" and args[1] == "101":
            self.capture_present = False
        return ""


class AudioRouterTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temporary_directory.name) / "session.json"
        self.pactl = FakePactl()
        self.router = AudioRouter(pactl=self.pactl, state_path=self.state_path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_start_creates_separate_source_and_moves_existing_audio(self):
        state = self.router.start("speaker", "mic")

        self.assertFalse(state.mixed)
        self.assertEqual(len(state.modules), 3)
        self.assertIn(("set-default-sink", CAPTURE_SINK), self.pactl.calls)
        self.assertIn(("move-sink-input", "44", CAPTURE_SINK), self.pactl.calls)
        self.assertTrue(
            any(call[:2] == ("load-module", "module-remap-source") for call in self.pactl.calls)
        )
        self.assertEqual(json.loads(self.state_path.read_text())["output"], "speaker")

    def test_mixed_mode_creates_mix_bus_and_two_loopbacks(self):
        state = self.router.start("speaker", "mic", mixed=True)

        self.assertEqual(len(state.modules), 7)
        loopbacks = [
            call for call in self.pactl.calls if call[:2] == ("load-module", "module-loopback")
        ]
        self.assertEqual(len(loopbacks), 3)

    def test_stop_restores_output_and_unloads_modules(self):
        state = self.router.start("speaker", "mic")

        self.router.stop()

        self.assertIn(("set-default-sink", "speaker"), self.pactl.calls)
        unloaded = [call for call in self.pactl.calls if call[0] == "unload-module"]
        self.assertEqual([int(call[1]) for call in unloaded], list(reversed(state.modules)))
        self.assertFalse(self.state_path.exists())

    def test_rejects_second_session(self):
        self.router.start("speaker", "mic")

        with self.assertRaisesRegex(AudioError, "already active"):
            self.router.start("speaker", "mic")

    def test_stop_does_not_unload_reused_ids_after_audio_server_restart(self):
        self.router.start("speaker", "mic")
        self.pactl.capture_present = False
        self.pactl.calls.clear()
        self.pactl.sink_inputs[0]["sink"] = 1

        self.router.stop()

        self.assertFalse(any(call[0] == "unload-module" for call in self.pactl.calls))
        self.assertFalse(self.state_path.exists())


if __name__ == "__main__":
    unittest.main()
