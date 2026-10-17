import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.build import LINUX_MACHINE_AARCH64, _is_aarch64_elf, build_stage2


class QFabricBuildTests(unittest.TestCase):
    def test_detects_aarch64_elf(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact"
            header = bytearray(20)
            header[:6] = b"\x7fELF\x02\x01"
            header[18:20] = LINUX_MACHINE_AARCH64.to_bytes(2, "little")
            path.write_bytes(header)
            self.assertTrue(_is_aarch64_elf(path))

    def test_missing_toolchains_produce_target_specific_failures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.dict(
                "os.environ",
                {
                    "QF_ARM64_CXX": "missing-qf-arm64-compiler",
                    "QF_ARDUINO_CLI": "missing-qf-arduino-cli",
                },
                clear=False,
            ):
                report = build_stage2(root)

            self.assertEqual(report["status"], "fail")
            self.assertIn("missing-qf-arm64-compiler", report["targets"]["linux"]["stderr"])
            self.assertIn("missing-qf-arduino-cli", report["targets"]["rt"]["stderr"])
            self.assertTrue((root / "build/stage2/build-report.json").is_file())


if __name__ == "__main__":
    unittest.main()
