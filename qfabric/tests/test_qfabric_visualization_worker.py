import unittest

from qfabric.visualization import TaskTelemetry, VisualEvent
from qfabric.visualization_worker import VisualizationWorker


def telemetry(decision_id=1, **changes):
    values = {
        "decision_id": decision_id,
        "task": "add",
        "slot": 0,
        "domain": "linux",
        "epoch": 1,
        "contract_state": "SATISFIED",
        "jitter_ns": 0,
        "jitter_bucket": 0,
        "ipc_active": False,
    }
    values.update(changes)
    return TaskTelemetry(**values)


class QFabricVisualizationWorkerTests(unittest.TestCase):
    def test_rate_limit_coalescing_and_unchanged_suppression(self):
        worker = VisualizationWorker(refresh_hz=10, capacity=2)
        worker.submit(telemetry(1, contract_state="UNKNOWN"))
        worker.submit(telemetry(2, contract_state="AT_RISK"))
        worker.submit(telemetry(3, contract_state="SATISFIED"))
        self.assertEqual(worker.diagnostics()["dropped"], 1)
        update = worker.poll(0)
        self.assertEqual(update.decision_id, 3)
        self.assertIsNone(worker.poll(50_000_000))
        self.assertIsNone(worker.poll(100_000_000))
        self.assertEqual(worker.diagnostics()["suppressed_unchanged"], 1)

    def test_event_overlay_expires_back_to_combined_view(self):
        worker = VisualizationWorker(refresh_hz=10, overlay_frames=2)
        worker.submit(
            telemetry(
                event=VisualEvent.TRANSITION,
                domain="rt",
                source_domain="linux",
                ipc_active=True,
            )
        )
        first = worker.poll(0)
        self.assertIsNotNone(first)
        self.assertIsNone(worker.poll(100_000_000))
        restored = worker.poll(200_000_000)
        self.assertIsNotNone(restored)
        self.assertNotEqual(restored.checksum, first.checksum)
        self.assertEqual(restored.frame[0], 0)
        self.assertGreater(restored.frame[7 * 13], 0)

    def test_off_clears_once_then_performs_no_periodic_updates(self):
        worker = VisualizationWorker(refresh_hz=8)
        worker.submit(telemetry())
        self.assertIsNotNone(worker.poll(0))
        worker.set_mode("off")
        cleared = worker.poll(200_000_000)
        self.assertIsNotNone(cleared)
        self.assertTrue(all(value == 0 for value in cleared.frame))
        self.assertIsNone(worker.poll(400_000_000))

    def test_refresh_rate_is_bounded_to_acceptance_range(self):
        for rate in (4, 11):
            with self.assertRaisesRegex(ValueError, "between 5 and 10"):
                VisualizationWorker(refresh_hz=rate)


if __name__ == "__main__":
    unittest.main()
