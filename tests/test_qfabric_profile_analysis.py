import copy
import unittest

from qfabric.profile_analysis import analyze_profile
from qfabric.profiling import Instrumentation, ProfileCollector, ProfileSample


class QFabricProfileAnalysisTests(unittest.TestCase):
    def build_report(self):
        collector = ProfileCollector(capacity=4, warmup=0, minimum_samples=2)
        invocation = 1
        for domain in ("linux", "rt"):
            for mode in Instrumentation:
                for latency in (100, 120):
                    collector.add(
                        ProfileSample(
                            task="add",
                            task_id=1,
                            invocation_id=invocation,
                            epoch=1,
                            domain=domain,
                            instrumentation=mode,
                            outcome="ok",
                            linux_started_ns=1_000,
                            linux_finished_ns=1_000 + latency,
                            local_execution_ns=10 if mode is Instrumentation.FULL else None,
                            communication_ns=latency - 10 if mode is Instrumentation.FULL else None,
                            queueing_ns=1,
                            deadline_ns=200,
                            deadline_met=True,
                        )
                    )
                    invocation += 1
        return collector.report()

    def test_independent_verification_and_overhead_pass(self) -> None:
        analysis = analyze_profile(self.build_report())
        self.assertEqual(analysis["status"], "pass")
        self.assertTrue(analysis["invocation_ids_unique"])
        self.assertEqual(len(analysis["instrumentation_overhead"]), 4)
        self.assertTrue(all(item["passed"] for item in analysis["metric_verification"]))

    def test_tampered_aggregate_fails(self) -> None:
        report = copy.deepcopy(self.build_report())
        report["groups"][0]["metrics_ns"]["end_to_end"]["mean"] += 10
        analysis = analyze_profile(report, tolerance_pct=0)
        self.assertEqual(analysis["status"], "fail")
        self.assertIn("metric mismatch", analysis["failures"][0])


if __name__ == "__main__":
    unittest.main()
