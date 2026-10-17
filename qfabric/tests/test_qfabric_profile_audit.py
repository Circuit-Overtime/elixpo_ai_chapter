import unittest

from qfabric.profile_audit import audit_stage4
from qfabric.profiling import Instrumentation, ProfileCollector, ProfileSample, write_profile


def add_sample(collector, invocation, domain, mode, latency):
    collector.add(
        ProfileSample(
            task="add",
            task_id=1,
            invocation_id=invocation,
            epoch=1,
            domain=domain,
            instrumentation=mode,
            outcome="ok",
            linux_started_ns=100,
            linux_finished_ns=100 + latency,
            local_execution_ns=10 if mode is Instrumentation.FULL else None,
            communication_ns=latency - 10 if mode is Instrumentation.FULL else None,
            queueing_ns=1,
            deadline_ns=1_000,
            deadline_met=True,
        )
    )


class QFabricProfileAuditTests(unittest.TestCase):
    def test_complete_evidence_passes(self) -> None:
        import tempfile
        from pathlib import Path

        overhead = ProfileCollector(capacity=4, warmup=0, minimum_samples=2)
        invocation = 1
        for domain in ("linux", "rt"):
            for mode in Instrumentation:
                for latency in (100, 110):
                    add_sample(overhead, invocation, domain, mode, latency)
                    invocation += 1

        cold = ProfileCollector(capacity=20, warmup=0, minimum_samples=20)
        for domain in ("linux", "rt"):
            for _ in range(5):
                add_sample(cold, invocation, domain, Instrumentation.REDUCED, 100)
                invocation += 1

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            overhead_path = root / "overhead.json"
            cold_path = root / "cold.json"
            write_profile(overhead.report(), overhead_path)
            write_profile(cold.report(), cold_path)
            report = audit_stage4(overhead_path, cold_path)
        self.assertEqual(report["status"], "pass")
        self.assertFalse(report["failures"])

    def test_overhead_limit_failure_is_reported(self) -> None:
        import tempfile
        from pathlib import Path

        overhead = ProfileCollector(capacity=2, warmup=0, minimum_samples=1)
        invocation = 1
        for domain in ("linux", "rt"):
            for mode in Instrumentation:
                latency = 200 if mode is Instrumentation.FULL else 100
                add_sample(overhead, invocation, domain, mode, latency)
                invocation += 1
        cold = ProfileCollector(capacity=20, warmup=0, minimum_samples=20)
        for domain in ("linux", "rt"):
            add_sample(cold, invocation, domain, Instrumentation.REDUCED, 100)
            invocation += 1

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            overhead_path = root / "overhead.json"
            cold_path = root / "cold.json"
            write_profile(overhead.report(), overhead_path)
            write_profile(cold.report(), cold_path)
            report = audit_stage4(overhead_path, cold_path)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("overhead exceeds" in failure for failure in report["failures"]))


if __name__ == "__main__":
    unittest.main()
