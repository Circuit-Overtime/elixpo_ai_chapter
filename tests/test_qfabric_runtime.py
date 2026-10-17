import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.runtime import parse_add_arguments, run_linux, run_rt


class FakeBridge:
    def __init__(self, result):
        self.result = result
        self.disconnected = False

    def call(self, method, *args, timeout=5):
        if method != "qf_qtask_add":
            raise AssertionError(method)
        return self.result

    def disconnect(self):
        self.disconnected = True


class QFabricRuntimeTests(unittest.TestCase):
    def test_parse_add_arguments(self) -> None:
        self.assertEqual(parse_add_arguments(["2", "3"]), (2, 3))
        self.assertEqual(parse_add_arguments(["-2", "3"]), (-2, 3))
        with self.assertRaisesRegex(ValueError, "exactly two"):
            parse_add_arguments(["2"])
        with self.assertRaisesRegex(ValueError, "signed 32-bit"):
            parse_add_arguments(["two", "3"])
        with self.assertRaisesRegex(ValueError, "result exceeds"):
            parse_add_arguments([str((1 << 31) - 1), "1"])

    def test_linux_domain_invokes_arm64_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "build/stage2/linux/qf-add-linux"
            artifact.parent.mkdir(parents=True)
            artifact.touch()
            completed = subprocess.CompletedProcess([], 0, stdout="5\n", stderr="")
            with (
                patch("qfabric.runtime.platform.machine", return_value="aarch64"),
                patch("qfabric.runtime.subprocess.run", return_value=completed) as run,
            ):
                self.assertEqual(run_linux(root, 2, 3), 5)
            self.assertEqual(run.call_args.args[0], [str(artifact), "2", "3"])

    def test_linux_domain_rejects_non_arm64_host(self) -> None:
        with patch("qfabric.runtime.platform.machine", return_value="x86_64"):
            with self.assertRaisesRegex(RuntimeError, "targets ARM64"):
                run_linux(Path.cwd(), 2, 3)

    def test_rt_domain_calls_registered_mcu_task(self) -> None:
        bridge = FakeBridge(5)
        with patch("qfabric.runtime._connect_bridge", return_value=bridge):
            self.assertEqual(run_rt("unix:///router.sock", 2, 3, timeout=1), 5)
        self.assertTrue(bridge.disconnected)


if __name__ == "__main__":
    unittest.main()
