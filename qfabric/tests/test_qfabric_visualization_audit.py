import json
import tempfile
import unittest
from pathlib import Path

from qfabric.visualization_audit import audit_stage9


def profile(p95: int, mean: int) -> dict[str, object]:
    return {
        "groups": [
            {
                "task": "add",
                "domain": domain,
                "instrumentation": "full",
                "failures": 0,
                "deadline": {"misses": 0},
                "window": {"estimator_valid": True},
                "metrics_ns": {
                    "end_to_end": {"p95": p95 + offset, "mean": mean + offset}
                },
            }
            for domain, offset in (("linux", 0), ("rt", 2_000_000))
        ]
    }


class QFabricVisualizationAuditTests(unittest.TestCase):
    def test_complete_bounded_evidence_passes(self):
        cases = []
        for mode, state, event in (
            ("placement", "SATISFIED", "stable"),
            ("placement", "SATISFIED", "transition"),
            ("contracts", "UNKNOWN", "stable"),
            ("contracts", "AT_RISK", "stable"),
            ("contracts", "VIOLATED", "stable"),
            ("jitter", "VIOLATED", "rollback"),
            ("ipc", "AT_RISK", "infeasible"),
        ):
            cases.append(
                {
                    "mode": mode,
                    "telemetry": {"contract_state": state, "event": event},
                    "diagnostics": {"maximum_draw_us": 8},
                }
            )
        campaign = {
            "status": "pass",
            "configuration": {"refresh_hz": 8},
            "cases": cases,
            "off": {
                "linux_user_rgb": 0,
                "diagnostics": {
                    "mode_id": 0,
                    "target_refresh_hz": 0,
                    "frame_checksum": 0,
                }
            },
            "linux_system_leds": {"triggers_preserved": True},
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = []
            for name, value in (
                ("campaign.json", campaign),
                ("disabled.json", profile(10_000_000, 8_000_000)),
                ("enabled.json", profile(10_500_000, 8_300_000)),
            ):
                path = root / name
                path.write_text(json.dumps(value), encoding="utf-8")
                paths.append(path)
            report = audit_stage9(paths[0], [paths[1]], [paths[2]])
        self.assertEqual(report["status"], "pass")
        self.assertTrue(all(report["checks"].values()))
        self.assertEqual(report["maximum_draw_us"], 8)

    def test_protected_contract_failure_fails_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            campaign = root / "campaign.json"
            campaign.write_text(
                json.dumps(
                    {
                        "status": "fail",
                        "configuration": {"refresh_hz": 20},
                        "cases": [],
                        "off": {
                            "linux_user_rgb": 1,
                            "diagnostics": {
                                "mode_id": 1,
                                "target_refresh_hz": 8,
                                "frame_checksum": 1,
                            }
                        },
                        "linux_system_leds": {"triggers_preserved": False},
                    }
                ),
                encoding="utf-8",
            )
            disabled = root / "disabled.json"
            enabled = root / "enabled.json"
            disabled.write_text(json.dumps(profile(10_000_000, 8_000_000)), encoding="utf-8")
            broken = profile(20_000_000, 16_000_000)
            broken["groups"][0]["deadline"]["misses"] = 1
            enabled.write_text(json.dumps(broken), encoding="utf-8")
            report = audit_stage9(campaign, [disabled], [enabled])
        self.assertEqual(report["status"], "fail")
        self.assertFalse(report["checks"]["protected_contracts_healthy"])


if __name__ == "__main__":
    unittest.main()
