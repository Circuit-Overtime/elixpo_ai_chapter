import tempfile
import unittest
from pathlib import Path

from qfabric.visualization import (
    MATRIX_PIXELS,
    RPC_ROWS,
    TaskTelemetry,
    ViewMode,
    VisualEvent,
    changed_pixels,
    render_frame,
    telemetry_from_decision,
)
from qfabric.visualization_runtime import _write_linux_user_rgb


def telemetry(**changes):
    values = {
        "decision_id": 42,
        "task": "add",
        "slot": 0,
        "domain": "linux",
        "epoch": 7,
        "contract_state": "SATISFIED",
        "jitter_ns": 10,
        "jitter_bucket": 1,
        "ipc_active": True,
    }
    values.update(changes)
    return TaskTelemetry(**values)


class QFabricVisualizationTests(unittest.TestCase):
    def test_linux_user_rgb_writes_only_declared_user_channels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("red:user", "green:user", "blue:user", "red:panic"):
                (root / name).mkdir()
                (root / name / "brightness").write_text("0\n", encoding="ascii")
            observed = _write_linux_user_rgb(0xFF00FF, root)
            self.assertEqual(observed, 0xFF00FF)
            self.assertEqual((root / "red:user" / "brightness").read_text(), "1\n")
            self.assertEqual((root / "green:user" / "brightness").read_text(), "0\n")
            self.assertEqual((root / "blue:user" / "brightness").read_text(), "1\n")
            self.assertEqual((root / "red:panic" / "brightness").read_text(), "0\n")

    def test_five_views_respect_linux_rpc_rt_row_ownership(self):
        linux = telemetry(slot=0, domain="linux")
        rt = telemetry(slot=1, domain="rt", contract_state="AT_RISK")
        placement = render_frame(ViewMode.PLACEMENT, [linux, rt])
        self.assertEqual(len(placement), MATRIX_PIXELS)
        self.assertTrue(all(placement[row * 13] > 0 for row in (0, 1, 2)))
        self.assertTrue(all(placement[row * 13 + 1] > 0 for row in (5, 6, 7)))
        self.assertTrue(all(placement[row * 13] > 0 for row in RPC_ROWS))

        contracts = render_frame("contracts", [linux, rt])
        self.assertGreater(contracts[5 * 13 + 1], contracts[0])
        jitter = render_frame("jitter", [linux, rt])
        self.assertEqual(jitter[0], 2)
        ipc = render_frame("ipc", [linux, rt])
        self.assertEqual(sum(value > 0 for value in ipc), 4)
        self.assertEqual(render_frame("off", [linux, rt]), (0,) * MATRIX_PIXELS)

    def test_transition_and_rollback_overlays_have_distinct_directional_grammar(self):
        transition = telemetry(
            domain="rt",
            source_domain="linux",
            event=VisualEvent.TRANSITION,
        )
        rollback = telemetry(
            domain="linux",
            source_domain="rt",
            event=VisualEvent.ROLLBACK,
        )
        transition_frame = render_frame("placement", [transition], overlay=transition)
        rollback_frame = render_frame("placement", [rollback], overlay=rollback)
        self.assertEqual(transition_frame[0], 4)
        self.assertEqual(transition_frame[7 * 13], 7)
        self.assertEqual(rollback_frame[0], 4)
        self.assertEqual(rollback_frame[7 * 13], 7)
        self.assertNotEqual(transition.to_dict(), rollback.to_dict())

    def test_changed_pixels_emits_only_real_frame_differences(self):
        previous = render_frame("off", [])
        current = render_frame("contracts", [telemetry()])
        changes = changed_pixels(previous, current)
        self.assertEqual(len(changes), 3)
        self.assertEqual({item["column"] for item in changes}, {0})
        self.assertEqual(changed_pixels(current, current), [])

    def test_duplicate_slots_and_invalid_telemetry_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            render_frame("placement", [telemetry(), telemetry(task="filter")])
        with self.assertRaises(ValueError):
            telemetry(slot=13)

    def test_recovery_record_maps_decision_id_action_and_measured_jitter(self):
        record = {
            "decision_id": 11,
            "task": "add",
            "kind": "recovery",
            "outcome": {
                "before": {"state": "PROBATION", "domain": "rt", "epoch": 8},
                "after": {"state": "COOLDOWN", "domain": "linux", "epoch": 9},
                "observation": {
                    "source_contract_state": "VIOLATED",
                    "target_contract_state": "VIOLATED",
                },
            },
            "facts": {
                "decision": {
                    "actions": [
                        {"type": "rollback_armed"},
                        {"type": "rollback"},
                    ]
                },
                "thresholds": {"deadline_ns": 20_000_000},
                "execution": {
                    "samples": [
                        {"outcome": "ok", "latency_ns": 10_000_000},
                        {"outcome": "ok", "latency_ns": 13_000_000},
                    ]
                },
            },
        }
        item = telemetry_from_decision(record, slot=4)
        self.assertEqual(item.decision_id, 11)
        self.assertEqual(item.event, VisualEvent.ROLLBACK)
        self.assertEqual(item.domain, "linux")
        self.assertEqual(item.source_domain, "rt")
        self.assertEqual(item.contract_state, "VIOLATED")
        self.assertEqual(item.jitter_ns, 3_000_000)
        self.assertEqual(item.jitter_bucket, 3)

    def test_insufficient_evidence_maps_to_unknown_without_infeasible_overlay(self):
        record = {
            "decision_id": 3,
            "task": "add",
            "kind": "recommendation",
            "facts": {
                "decision": {
                    "classifications": ["insufficient_evidence"],
                    "current_domain": "linux",
                    "move_accepted": False,
                    "selected_domain": None,
                },
                "candidates": [
                    {
                        "domain": "linux",
                        "contract": {"state": "SATISFIED"},
                    }
                ],
            },
        }
        item = telemetry_from_decision(record, slot=0)
        self.assertEqual(item.contract_state, "UNKNOWN")
        self.assertEqual(item.event, VisualEvent.STABLE)


if __name__ == "__main__":
    unittest.main()
