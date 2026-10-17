import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qfabric.cli import main
from qfabric.contracts import ContractObservation, DeadlineContract
from qfabric.profiling import Instrumentation, ProfileCollector, ProfileSample, write_profile


class QFabricCliTests(unittest.TestCase):
    def test_required_stage9_view_interface(self) -> None:
        report = {
            "mode": "placement",
            "decision_id": 11,
            "diagnostics": {
                "applied_frames": 2,
                "changed_pixels": 12,
                "maximum_draw_us": 8,
            },
        }
        output = io.StringIO()
        with (
            patch("qfabric.cli.set_view", return_value=report) as view,
            contextlib.redirect_stdout(output),
        ):
            status = main(
                [
                    "view",
                    "placement",
                    "--decision",
                    "11",
                    "--history",
                    "decisions.jsonl",
                ]
            )
        self.assertEqual(status, 0)
        self.assertIn("QFabric physical view: placement", output.getvalue())
        self.assertEqual(view.call_args.kwargs["decision_id"], 11)
        self.assertEqual(view.call_args.kwargs["refresh_hz"], 8)
    def test_bounded_hardware_recovery_command(self) -> None:
        source = {
            "schema_version": 1,
            "policy": {"minimum_evidence": 1, "cooldown_active": False},
            "mcu": {"utilization_without_task_pct": 0, "reserved_headroom_pct": 0},
            "tasks": [{"name": "add"}],
        }
        report = {
            "status": "pass",
            "failures": [],
            "observed": {"final_domain": "rt"},
        }
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "hardware.json"
            input_path.write_text(json.dumps(source), encoding="utf-8")
            stdout = io.StringIO()
            with (
                patch(
                    "qfabric.cli.run_hardware_recovery", return_value=report
                ) as run,
                patch("qfabric.cli.write_hardware_recovery") as write,
                contextlib.redirect_stdout(stdout),
            ):
                status = main(
                    [
                        "recover",
                        "hardware",
                        "--recommendation-input",
                        str(input_path),
                        "--mode",
                        "success",
                        "--epoch",
                        "42",
                        "--output",
                        str(output_path),
                    ]
                )
            self.assertEqual(status, 0)
            self.assertIn("hardware recovery (success): pass", stdout.getvalue())
            self.assertEqual(run.call_args.kwargs["initial_epoch"], 42)
            self.assertEqual(run.call_args.kwargs["deadline_ns"], 20_000_000)
            write.assert_called_once_with(report, output_path)

    def test_stage7_audit_command(self) -> None:
        report = {"status": "pass", "failures": []}
        output = io.StringIO()
        with (
            patch("qfabric.cli.audit_stage7", return_value=report) as audit,
            patch("qfabric.cli.write_stage7_audit") as write,
            contextlib.redirect_stdout(output),
        ):
            status = main(
                [
                    "recover",
                    "audit",
                    "--root",
                    "stage7-root",
                    "--recommendation-input",
                    "recommendation.json",
                    "--output",
                    "audit.json",
                ]
            )
        self.assertEqual(status, 0)
        audit.assert_called_once_with(Path("stage7-root"), Path("recommendation.json"))
        write.assert_called_once_with(report, Path("audit.json"))
        self.assertIn("Stage 7 audit: pass", output.getvalue())

    def test_recovery_trace_replay_command(self) -> None:
        trace = {
            "schema_version": 1,
            "policy": {
                "probation_windows": 2,
                "probation_max_windows": 3,
                "cooldown_windows": 2,
                "blacklist_windows": 3,
            },
            "initial": {"domain": "linux", "epoch": 4},
            "observations": [
                {
                    "source_contract_state": "AT_RISK",
                    "evidence_valid": True,
                }
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.json"
            report_path = Path(directory) / "report.json"
            trace_path.write_text(json.dumps(trace), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = main(
                    [
                        "recover",
                        "replay",
                        "--input",
                        str(trace_path),
                        "--output",
                        str(report_path),
                    ]
                )
            self.assertEqual(status, 0)
            self.assertIn("final state: MONITORING", output.getvalue())
            self.assertEqual(json.loads(report_path.read_text())["final"]["epoch"], 4)

    def test_recommend_and_filtered_recommend_commands(self) -> None:
        source = {
            "schema_version": 1,
            "policy": {"minimum_evidence": 2, "cooldown_active": False},
            "mcu": {"utilization_without_task_pct": 10, "reserved_headroom_pct": 20},
            "tasks": [],
        }
        for name in ("filter", "control"):
            source["tasks"].append(
                {
                    "name": name,
                    "effect": "Q_PURE",
                    "current_domain": "linux",
                    "rate_hz": 10,
                    "contract": {"deadline_ns": 1_000, "max_miss_rate_pct": 1},
                    "chain_edges": [],
                    "candidates": {
                        domain: {
                            "evidence_count": 2,
                            "end_to_end_p95_ns": 100 if domain == "linux" else 200,
                            "local_execution_p95_ns": 10,
                            "observed_miss_rate_pct": 0,
                            "contract_state": "SATISFIED",
                            "admission_allowed": True,
                        }
                        for domain in ("linux", "rt")
                    },
                }
            )
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "report.json"
            input_path.write_text(json.dumps(source), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = main(
                    [
                        "recommend",
                        "filter",
                        "--input",
                        str(input_path),
                        "--output",
                        str(output_path),
                    ]
                )
            self.assertEqual(status, 0)
            self.assertIn("filter: linux", output.getvalue())
            report = json.loads(output_path.read_text())
            self.assertEqual([record["task"] for record in report["records"]], ["filter"])

    def test_contract_trace_replay_command(self) -> None:
        contract = DeadlineContract(
            deadline_ns=100,
            window_size=2,
            minimum_samples=2,
            warmup_samples=0,
            max_miss_rate_pct=25,
            at_risk_miss_rate_pct=10,
            recovery_miss_rate_pct=0,
            violation_windows=2,
            recovery_windows=2,
            infeasible_windows=3,
        )
        trace = {
            "schema_version": 1,
            "contract": contract.to_dict(),
            "observations": [
                ContractObservation("ok", 50).to_dict(),
                ContractObservation("ok", 60).to_dict(),
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.json"
            report_path = Path(directory) / "report.json"
            trace_path.write_text(json.dumps(trace), encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = main(
                    [
                        "contract",
                        "replay",
                        "--input",
                        str(trace_path),
                        "--output",
                        str(report_path),
                    ]
                )
            self.assertEqual(status, 0)
            self.assertIn("state: SATISFIED", output.getvalue())
            self.assertEqual(json.loads(report_path.read_text())["state"], "SATISFIED")

    def test_status_human_and_json_output(self) -> None:
        collector = ProfileCollector(capacity=2, warmup=0, minimum_samples=1)
        collector.add(
            ProfileSample(
                task="add",
                task_id=1,
                invocation_id=1,
                epoch=1,
                domain="linux",
                instrumentation=Instrumentation.REDUCED,
                outcome="ok",
                linux_started_ns=10,
                linux_finished_ns=20,
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory) / "profile.json"
            write_profile(collector.report(), profile)
            human = io.StringIO()
            with contextlib.redirect_stdout(human):
                status = main(["status", "--input", str(profile)])
            self.assertEqual(status, 0)
            self.assertIn("QFabric profile status", human.getvalue())

            machine = io.StringIO()
            with contextlib.redirect_stdout(machine):
                status = main(["status", "--input", str(profile), "--json"])
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(machine.getvalue())["schema_version"], 1)

    def test_abi_check_and_vector_commands(self) -> None:
        root = Path(__file__).resolve().parents[1]
        schema = root / "config/qfabric-abi.json"
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main(["abi", "check", "--schema", str(schema)])
        self.assertEqual(status, 0)
        self.assertIn("ABI schema valid", output.getvalue())

        with tempfile.TemporaryDirectory() as directory:
            vectors = Path(directory) / "vectors.json"
            status = main(
                ["abi", "vectors", "--schema", str(schema), "--output", str(vectors)]
            )
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(vectors.read_text())["protocol_version"], 1)

    def test_required_linux_command_shape(self) -> None:
        output = io.StringIO()
        with (
            patch("qfabric.cli.run_linux", return_value=5) as run,
            contextlib.redirect_stdout(output),
        ):
            status = main(["run", "add", "--domain", "linux", "--", "2", "3"])
        self.assertEqual(status, 0)
        self.assertEqual(output.getvalue(), "5\n")
        self.assertEqual(run.call_args.args[1:], (2, 3))

    def test_required_rt_command_shape(self) -> None:
        output = io.StringIO()
        with (
            patch("qfabric.cli.run_rt", return_value=5) as run,
            contextlib.redirect_stdout(output),
        ):
            status = main(["run", "add", "--domain", "rt", "--", "2", "3"])
        self.assertEqual(status, 0)
        self.assertEqual(output.getvalue(), "5\n")
        self.assertEqual(run.call_args.args[1:3], (2, 3))

    def test_domains_share_validation_error(self) -> None:
        errors = []
        for domain in ("linux", "rt"):
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                status = main(["run", "add", "--domain", domain, "--", "2"])
            self.assertEqual(status, 1)
            errors.append(error.getvalue())
        self.assertEqual(errors[0], errors[1])


if __name__ == "__main__":
    unittest.main()
