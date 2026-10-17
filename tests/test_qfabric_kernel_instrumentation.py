import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.kernel_audit import audit_stage10
from qfabric.kernel_instrumentation import _is_file, _syscall_number, run_kernel_benchmark


def benchmark(mode: str, *, p95: int, forced: bool = False) -> dict[str, object]:
    perf = mode == "perf"
    return {
        "status": "pass",
        "mode": mode,
        "configuration": {"iterations": 1, "injected_delay_ns": 0},
        "perf_error": "forced-unavailable" if forced else None,
        "policy_location": "userspace",
        "successful_samples": 1,
        "failures": 0,
        "metrics": {
            "end_to_end_ns": {"p95": p95},
            "non_cpu_ns": {
                "p50": 7_000_000 if perf else None,
                "p95": 7_000_000 if perf else None,
            },
        },
        "samples": [
            {
                "end_to_end_ns": 8_000_000,
                "task_clock_ns": 1_000_000 if perf else None,
                "non_cpu_ns": 7_000_000 if perf else None,
                "context_switches": 2 if perf else None,
                "cpu_migrations": 0 if perf else None,
            }
        ],
    }


class QFabricKernelInstrumentationTests(unittest.TestCase):
    def test_perf_syscall_numbers_are_architecture_specific(self):
        self.assertEqual(_syscall_number("aarch64"), 241)
        self.assertEqual(_syscall_number("x86_64"), 298)
        with self.assertRaises(OSError):
            _syscall_number("unsupported")

    def test_permission_denied_optional_interface_is_reported_unavailable(self):
        with patch("pathlib.Path.is_file", side_effect=PermissionError):
            self.assertFalse(_is_file(Path("/restricted/tracepoint")))

    def test_forced_perf_failure_keeps_userspace_benchmark_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "build/stage4/linux/qf-profile-linux"
            artifact.parent.mkdir(parents=True)
            artifact.write_text("placeholder", encoding="utf-8")
            with patch("qfabric.kernel_instrumentation._linux_invocation"):
                report = run_kernel_benchmark(
                    root,
                    iterations=3,
                    warmup=1,
                    timeout=2.0,
                    force_fallback=True,
                )
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["mode"], "userspace-fallback")
        self.assertEqual(report["successful_samples"], 3)
        self.assertEqual(report["perf_error"], "forced-unavailable")

    def test_stage10_audit_requires_complete_attribution_and_safe_fallback(self):
        capabilities = {
            "selection": {
                "mechanism": "perf_event_open-software-counters",
                "perf_available": True,
                "kernel_inclusive_scheduler_events": True,
                "scheduler_event_privilege": "root-or-CAP_PERFMON",
                "wake_up_latency": "unavailable-with-stock-kernel",
                "cpu_pressure": "unavailable-CONFIG_PSI-disabled",
                "ebpf": "not-justified-no-scheduler-tracepoints-or-BTF",
                "custom_kernel_module": "not-introduced",
            }
        }
        stage4 = {
            "groups": [
                {
                    "task": "add",
                    "domain": "linux",
                    "instrumentation": "full",
                    "metrics_ns": {"queueing": {"p95": 1_000}},
                }
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            values = {
                "capabilities.json": capabilities,
                "stage4.json": stage4,
                "baseline.json": benchmark("userspace-baseline", p95=8_000_000),
                "perf.json": benchmark("perf", p95=8_200_000),
                "fallback.json": benchmark(
                    "userspace-fallback", p95=8_000_000, forced=True
                ),
            }
            accuracy = benchmark("perf", p95=13_200_000)
            accuracy["configuration"]["injected_delay_ns"] = 5_000_000
            accuracy["metrics"]["non_cpu_ns"]["p50"] = 12_000_000
            values["accuracy.json"] = accuracy
            paths = {}
            for name, value in values.items():
                path = root / name
                path.write_text(json.dumps(value), encoding="utf-8")
                paths[name] = path
            report = audit_stage10(
                paths["capabilities.json"],
                paths["stage4.json"],
                [paths["baseline.json"]],
                [paths["perf.json"]],
                [paths["perf.json"]],
                paths["accuracy.json"],
                paths["fallback.json"],
            )
        self.assertEqual(report["status"], "pass")
        self.assertTrue(all(report["checks"].values()))


if __name__ == "__main__":
    unittest.main()
