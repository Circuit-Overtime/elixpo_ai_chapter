import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.profile_runner import run_profile_campaign
from qfabric.profiling import Instrumentation


class FakeBridge:
    def __init__(self):
        self.diagnostics = [0, 0, 0, 0, 0]
        self.disconnected = False

    def call(self, method, *arguments, timeout=2):
        if method == "qf_stage4_add_profiled":
            epoch, counter, a, b, mode = arguments
            self.diagnostics = [epoch, counter, 250, 0, mode]
            return a + b
        if method == "qf_stage4_diagnostic":
            return self.diagnostics[arguments[0]]
        raise AssertionError(method)

    def disconnect(self):
        self.disconnected = True


class QFabricProfileRunnerTests(unittest.TestCase):
    def test_correlates_linux_and_rt_full_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "build/stage4/linux/qf-profile-linux"
            artifact.parent.mkdir(parents=True)
            artifact.touch()
            bridge = FakeBridge()
            clock_values = iter(
                value
                for base in (0, 1_000, 2_000, 3_000)
                for value in (base, base + 5, base + 105)
            )

            def linux_runner(command, **kwargs):
                invocation_id = command[1]
                return subprocess.CompletedProcess(
                    command, 0, stdout=f"{invocation_id} 5 25\n", stderr=""
                )

            with (
                patch("qfabric.profile_runner.platform.machine", return_value="aarch64"),
                patch("qfabric.profile_runner.subprocess.run", side_effect=linux_runner),
                patch("qfabric.profile_runner._connect_bridge", return_value=bridge),
                patch("qfabric.profile_runner.time.perf_counter_ns", side_effect=clock_values),
            ):
                report = run_profile_campaign(
                    root,
                    "unix:///router.sock",
                    domains=("linux", "rt"),
                    modes=(Instrumentation.FULL,),
                    iterations=2,
                    warmup=0,
                    capacity=10,
                    minimum_samples=2,
                    deadline_ns=1_000,
                    epoch=9,
                    timeout=1,
                )

        self.assertTrue(bridge.disconnected)
        self.assertEqual(len(report["groups"]), 2)
        linux, rt = report["groups"]
        self.assertEqual(linux["domain"], "linux")
        self.assertEqual(linux["metrics_ns"]["local_execution"]["mean"], 25)
        self.assertEqual(rt["domain"], "rt")
        self.assertEqual(rt["metrics_ns"]["local_execution"]["mean"], 250)
        for group in report["groups"]:
            self.assertTrue(group["window"]["estimator_valid"])
            self.assertEqual(group["metrics_ns"]["end_to_end"]["mean"], 100)
            self.assertEqual(group["metrics_ns"]["queueing"]["mean"], 5)

    def test_reduced_mode_omits_unavailable_components(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "build/stage4/linux/qf-profile-linux"
            artifact.parent.mkdir(parents=True)
            artifact.touch()

            def linux_runner(command, **kwargs):
                return subprocess.CompletedProcess(
                    command, 0, stdout=f"{command[1]} 5 0\n", stderr=""
                )

            with (
                patch("qfabric.profile_runner.platform.machine", return_value="aarch64"),
                patch("qfabric.profile_runner.subprocess.run", side_effect=linux_runner),
                patch(
                    "qfabric.profile_runner.time.perf_counter_ns",
                    side_effect=(0, 1, 11),
                ),
            ):
                report = run_profile_campaign(
                    root,
                    "unix:///router.sock",
                    domains=("linux",),
                    modes=(Instrumentation.REDUCED,),
                    iterations=1,
                    warmup=0,
                    capacity=2,
                    minimum_samples=1,
                    deadline_ns=100,
                    epoch=1,
                    timeout=1,
                )
        metrics = report["groups"][0]["metrics_ns"]
        self.assertEqual(metrics["local_execution"]["count"], 0)
        self.assertEqual(metrics["communication"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
