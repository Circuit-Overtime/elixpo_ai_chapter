import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from qfabric.visualization_runtime import set_view


class FakeBridge:
    def __init__(self):
        self.calls = []

    def call(self, *arguments, **_options):
        self.calls.append(arguments)
        if arguments[0] in {"qf_stage9_configure", "qf_stage9_submit"}:
            return True
        return 0

    def disconnect(self):
        return None


class QFabricVisualizationRuntimeTests(unittest.TestCase):
    def test_linux_transition_keeps_mcu_health_off_when_overlay_is_restored(self):
        record = {
            "decision_id": 2,
            "task": "add",
            "kind": "recommendation",
            "facts": {
                "decision": {
                    "classifications": [],
                    "current_domain": "rt",
                    "selected_domain": "linux",
                    "move_accepted": True,
                },
                "candidates": [
                    {
                        "domain": "linux",
                        "contract": {"state": "SATISFIED"},
                    }
                ],
            },
        }
        bridge = FakeBridge()
        store = Mock()
        store.get.return_value = record
        with (
            patch("qfabric.visualization_runtime._connect_bridge", return_value=bridge),
            patch("qfabric.visualization_runtime.DecisionStore", return_value=store),
            patch("qfabric.visualization_runtime._write_linux_user_rgb", return_value=0x00FF00),
            patch("qfabric.visualization_runtime.time.sleep"),
        ):
            report = set_view(
                "placement",
                history=Path("decisions.jsonl"),
                task="add",
                decision_id=2,
                address="test://bridge",
                overlay_ms=100,
            )
        submissions = [call for call in bridge.calls if call[0] == "qf_stage9_submit"]
        self.assertEqual(len(submissions), 2)
        self.assertEqual([call[2] for call in submissions], [0, 0])
        self.assertEqual(report["linux_user_rgb"], 0x00FF00)


if __name__ == "__main__":
    unittest.main()
