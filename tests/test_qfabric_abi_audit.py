import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.abi_audit import audit_stage3, write_stage3_audit

ROOT = Path(__file__).resolve().parents[1]


def passing_probe():
    return {
        "status": "pass",
        "schema_sha256": "677a92704da9e3dd60d632a67be61908aa1a1943e1590e8b69b03d88058726cf",
        "scalar_boundaries": True,
        "failures": [],
    }


class QFabricAbiAuditTests(unittest.TestCase):
    def test_complete_stage3_evidence_passes(self) -> None:
        completed = subprocess.CompletedProcess(
            [], 0, stdout="QFabric C++ ABI golden vectors passed\n", stderr=""
        )
        with (
            patch("qfabric.abi_audit._is_aarch64_elf", return_value=True),
            patch("qfabric.abi_audit.subprocess.run", return_value=completed),
            patch("qfabric.abi_audit.probe_mcu_abi", return_value=passing_probe()),
        ):
            report = audit_stage3(ROOT, "unix:///router.sock", timeout=1)
        self.assertEqual(report["status"], "pass")
        self.assertFalse(report["failures"])

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stage3-audit.json"
            write_stage3_audit(report, output)
            self.assertTrue(output.is_file())

    def test_missing_stage3_evidence_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch(
                "qfabric.abi_audit.probe_mcu_abi", side_effect=RuntimeError("unavailable")
            ):
                report = audit_stage3(root, "unix:///router.sock", timeout=1)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(report["failures"])


if __name__ == "__main__":
    unittest.main()
