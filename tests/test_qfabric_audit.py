import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.audit import EXPECTED_VALIDATION_ERROR, audit_stage2, write_audit
from qfabric.build import LINUX_MACHINE_AARCH64


class QFabricAuditTests(unittest.TestCase):
    def test_complete_dual_domain_evidence_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "qtasks/add.qtask.h"
            source.parent.mkdir(parents=True)
            source.write_text("Q_TASK(add, int, (int a, int b)) { return a + b; }\n")

            artifact = root / "build/stage2/linux/qf-add-linux"
            artifact.parent.mkdir(parents=True)
            header = bytearray(20)
            header[:6] = b"\x7fELF\x02\x01"
            header[18:20] = LINUX_MACHINE_AARCH64.to_bytes(2, "little")
            artifact.write_bytes(header)

            build_report = {
                "stage": 2,
                "task": "add",
                "status": "pass",
                "targets": {
                    "linux": {"passed": True, "architecture": "aarch64"},
                    "rt": {"passed": True, "architecture": "cortex-m33-zephyr"},
                },
            }
            report_path = root / "build/stage2/build-report.json"
            report_path.write_text(json.dumps(build_report))

            validation = {"exit_code": 1, "stderr": EXPECTED_VALIDATION_ERROR}
            with (
                patch("qfabric.audit.run_linux", return_value=5),
                patch("qfabric.audit.run_rt", return_value=5),
                patch("qfabric.audit._validation_result", return_value=validation),
                patch("qfabric.audit.platform.machine", return_value="aarch64"),
            ):
                result = audit_stage2(root, "unix:///router.sock", timeout=1)

            self.assertEqual(result["status"], "pass")
            self.assertTrue(result["runtime"]["results_match"])
            self.assertTrue(result["validation"]["matches"])

            output = root / "data/processed/stage2-audit.json"
            write_audit(result, output)
            self.assertEqual(json.loads(output.read_text())["status"], "pass")

    def test_missing_evidence_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            validation = {"exit_code": 1, "stderr": EXPECTED_VALIDATION_ERROR}
            with (
                patch("qfabric.audit.run_linux", side_effect=RuntimeError("missing")),
                patch("qfabric.audit.run_rt", side_effect=RuntimeError("missing")),
                patch("qfabric.audit._validation_result", return_value=validation),
            ):
                result = audit_stage2(root, "unix:///router.sock", timeout=1)

            self.assertEqual(result["status"], "fail")
            self.assertTrue(result["failures"])


if __name__ == "__main__":
    unittest.main()
