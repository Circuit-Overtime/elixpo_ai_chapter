import json
import tempfile
import unittest
from pathlib import Path

from qfabric.contract_analysis import (
    analyze_contract_sensitivity,
    audit_transition_scenario,
    build_transition_scenario,
    profile_group_to_trace,
    write_contract_trace,
    write_scenario_report,
    write_sensitivity_report,
)
from qfabric.contract_audit import audit_stage5
from qfabric.contracts import (
    ContractObservation,
    DeadlineContract,
    replay_contract,
    write_contract_report,
)
from qfabric.profiling import Instrumentation, ProfileCollector, ProfileSample, write_profile


def make_evidence(root: Path, *, observations_per_domain: int = 20) -> None:
    collector = ProfileCollector(
        capacity=observations_per_domain,
        warmup=0,
        minimum_samples=observations_per_domain,
    )
    invocation = 1
    for domain in ("linux", "rt"):
        for index in range(observations_per_domain):
            latency = 50 + index % 4
            collector.add(
                ProfileSample(
                    task="add",
                    task_id=1,
                    invocation_id=invocation,
                    epoch=1,
                    domain=domain,
                    instrumentation=Instrumentation.FULL,
                    outcome="ok",
                    linux_started_ns=100,
                    linux_finished_ns=100 + latency,
                    local_execution_ns=2,
                    communication_ns=latency - 2,
                    queueing_ns=0,
                    deadline_ns=100,
                    deadline_met=True,
                )
            )
            invocation += 1
    profile = collector.report()
    write_profile(profile, root / "profile.json")

    contract = DeadlineContract(
        deadline_ns=100,
        window_size=4,
        minimum_samples=4,
        warmup_samples=0,
        max_miss_rate_pct=25,
        at_risk_miss_rate_pct=10,
        recovery_miss_rate_pct=0,
        violation_windows=2,
        recovery_windows=2,
        infeasible_windows=3,
    )
    for domain in ("linux", "rt"):
        trace = profile_group_to_trace(
            profile,
            contract,
            task="add",
            domain=domain,
            instrumentation="full",
        )
        write_contract_trace(trace, root / f"{domain}-trace.json")
        observations = [
            ContractObservation.from_dict(value) for value in trace["observations"]
        ]
        write_contract_report(
            replay_contract(contract, observations), root / f"{domain}-report.json"
        )
        sensitivity = analyze_contract_sensitivity(
            contract,
            observations,
            window_sizes=[4, 5],
            violation_windows=[2, 3],
            recovery_windows=[1, 2],
        )
        write_sensitivity_report(sensitivity, root / f"{domain}-sensitivity.json")
        injected = build_transition_scenario(contract, observations)
        write_contract_trace(injected, root / f"{domain}-injected-trace.json")
        write_scenario_report(
            audit_transition_scenario(injected), root / f"{domain}-scenario.json"
        )


class QFabricContractAuditTests(unittest.TestCase):
    def test_complete_stage5_evidence_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_evidence(root)
            report = audit_stage5(root, minimum_hardware_observations=20)
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["failures"], [])
        self.assertEqual(
            {item["domain"] for item in report["hardware"]}, {"linux", "rt"}
        )

    def test_insufficient_hardware_evidence_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_evidence(root)
            report = audit_stage5(root, minimum_hardware_observations=21)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("insufficient" in failure for failure in report["failures"]))

    def test_unlabelled_injection_and_tampered_replay_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_evidence(root)
            injected_path = root / "rt-injected-trace.json"
            injected = json.loads(injected_path.read_text())
            injected["provenance"]["injected"] = False
            injected_path.write_text(json.dumps(injected), encoding="utf-8")
            replay_path = root / "linux-report.json"
            replay = json.loads(replay_path.read_text())
            replay["state"] = "UNKNOWN"
            replay_path.write_text(json.dumps(replay), encoding="utf-8")
            report = audit_stage5(root, minimum_hardware_observations=20)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("safely labelled" in failure for failure in report["failures"]))
        self.assertTrue(any("not deterministic" in failure for failure in report["failures"]))


if __name__ == "__main__":
    unittest.main()
