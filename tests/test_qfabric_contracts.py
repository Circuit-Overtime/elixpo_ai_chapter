import json
import tempfile
import unittest
from pathlib import Path

from qfabric.contracts import (
    ContractObservation,
    ContractState,
    DeadlineContract,
    DeadlineContractEvaluator,
    load_contract_trace,
    render_contract_status,
    replay_contract,
)


def ok(latency_ns: int = 50) -> ContractObservation:
    return ContractObservation("ok", latency_ns)


def miss(latency_ns: int = 101) -> ContractObservation:
    return ContractObservation("ok", latency_ns)


def policy(**changes) -> DeadlineContract:
    values = {
        "deadline_ns": 100,
        "window_size": 4,
        "minimum_samples": 4,
        "warmup_samples": 0,
        "max_miss_rate_pct": 25,
        "at_risk_miss_rate_pct": 10,
        "recovery_miss_rate_pct": 0,
        "violation_windows": 2,
        "recovery_windows": 2,
        "infeasible_windows": 3,
    }
    values.update(changes)
    return DeadlineContract(**values)


def add_window(evaluator: DeadlineContractEvaluator, values) -> dict[str, object]:
    result = None
    for value in values:
        result = evaluator.add(value)
    assert result is not None
    return result


class QFabricContractTests(unittest.TestCase):
    def test_unknown_during_warmup_and_until_complete_evidence_window(self) -> None:
        evaluator = DeadlineContractEvaluator(policy(warmup_samples=2))
        self.assertIsNone(evaluator.add(miss()))
        self.assertIsNone(evaluator.add(miss()))
        for _ in range(3):
            self.assertIsNone(evaluator.add(ok()))
        self.assertEqual(evaluator.state, ContractState.UNKNOWN)
        result = evaluator.add(ok())
        self.assertEqual(result["state_after"], "SATISFIED")
        self.assertEqual(result["evidence_count"], 4)

    def test_isolated_spike_does_not_trigger_violation(self) -> None:
        evaluator = DeadlineContractEvaluator(policy(window_size=10, minimum_samples=10))
        result = add_window(evaluator, [miss(), *[ok() for _ in range(9)]])
        self.assertEqual(result["miss_rate_pct"], 10)
        self.assertEqual(result["classification"], "healthy")
        self.assertEqual(evaluator.state, ContractState.SATISFIED)

    def test_sustained_violation_and_recovery_hysteresis(self) -> None:
        evaluator = DeadlineContractEvaluator(policy())
        add_window(evaluator, [ok()] * 4)
        first_bad = add_window(evaluator, [miss(), miss(), ok(), ok()])
        self.assertEqual(first_bad["state_after"], "AT_RISK")
        second_bad = add_window(evaluator, [miss(), miss(), ok(), ok()])
        self.assertEqual(second_bad["state_after"], "VIOLATED")

        first_good = add_window(evaluator, [ok()] * 4)
        self.assertEqual(first_good["state_after"], "VIOLATED")
        interrupted = add_window(evaluator, [miss(), ok(), ok(), ok()])
        self.assertEqual(interrupted["state_after"], "VIOLATED")
        self.assertEqual(interrupted["streaks"]["recovery"], 0)
        add_window(evaluator, [ok()] * 4)
        recovered = add_window(evaluator, [ok()] * 4)
        self.assertEqual(recovered["state_after"], "SATISFIED")

    def test_repeated_total_misses_are_empirically_infeasible(self) -> None:
        evaluator = DeadlineContractEvaluator(policy())
        for _ in range(2):
            result = add_window(evaluator, [miss()] * 4)
            self.assertNotEqual(result["state_after"], "INFEASIBLE")
        result = add_window(evaluator, [ContractObservation("timeout")] * 4)
        self.assertEqual(result["state_after"], "INFEASIBLE")
        self.assertEqual(result["missing_samples"], 4)
        self.assertEqual(result["confidence"]["level_pct"], 95.0)

    def test_missing_error_and_timeout_are_deadline_misses(self) -> None:
        evaluator = DeadlineContractEvaluator(policy())
        result = add_window(
            evaluator,
            [
                ContractObservation("missing"),
                ContractObservation("error"),
                ContractObservation("timeout"),
                ok(),
            ],
        )
        self.assertEqual(result["misses"], 3)
        self.assertEqual(result["missing_samples"], 3)
        self.assertEqual(result["state_after"], "AT_RISK")

    def test_risky_window_and_recovery_threshold_are_distinct(self) -> None:
        evaluator = DeadlineContractEvaluator(
            policy(
                window_size=10,
                minimum_samples=10,
                max_miss_rate_pct=30,
                at_risk_miss_rate_pct=10,
            )
        )
        risky = add_window(evaluator, [miss(), miss(), *[ok() for _ in range(8)]])
        self.assertEqual(risky["classification"], "risky")
        self.assertEqual(risky["state_after"], "AT_RISK")
        still_risk = add_window(evaluator, [miss(), *[ok() for _ in range(9)]])
        self.assertEqual(still_risk["classification"], "healthy")
        self.assertEqual(still_risk["state_after"], "AT_RISK")

    def test_trace_replay_is_deterministic(self) -> None:
        contract = policy()
        observations = [ok()] * 4 + [miss()] * 8 + [ok()] * 8
        first = replay_contract(contract, observations)
        second = replay_contract(contract, observations)
        self.assertEqual(first, second)
        self.assertEqual(first["state"], "SATISFIED")
        rendered = render_contract_status(first)
        self.assertIn("empirical soft real-time contract", rendered)
        self.assertIn("state: SATISFIED", rendered)

    def test_trace_schema_loads_and_rejects_unknown_policy_fields(self) -> None:
        trace = {
            "schema_version": 1,
            "contract": policy().to_dict(),
            "observations": [ok().to_dict(), ContractObservation("timeout").to_dict()],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trace.json"
            path.write_text(json.dumps(trace), encoding="utf-8")
            contract, observations = load_contract_trace(path)
            self.assertEqual(contract, policy())
            self.assertEqual(len(observations), 2)
            trace["contract"]["surprise"] = True
            path.write_text(json.dumps(trace), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown contract fields"):
                load_contract_trace(path)

    def test_policy_validation_rejects_ambiguous_thresholds(self) -> None:
        with self.assertRaisesRegex(ValueError, "thresholds"):
            policy(recovery_miss_rate_pct=20, at_risk_miss_rate_pct=10)
        with self.assertRaisesRegex(ValueError, "at least violation_windows"):
            policy(violation_windows=3, infeasible_windows=2)


if __name__ == "__main__":
    unittest.main()
