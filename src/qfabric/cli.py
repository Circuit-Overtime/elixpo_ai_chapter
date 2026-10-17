from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .abi import Schema
from .abi_audit import audit_stage3, write_stage3_audit
from .abi_codegen import generate_cpp_header, write_cpp_header
from .abi_probe import probe_mcu_abi, write_probe_report
from .abi_tools import build_golden_vectors, run_compile_fail_cases, write_golden_vectors
from .audit import audit_stage2, write_audit
from .build import build_stage2
from .contract_analysis import (
    analyze_contract_sensitivity,
    audit_transition_scenario,
    build_transition_scenario,
    profile_group_to_trace,
    write_contract_trace,
    write_scenario_report,
    write_sensitivity_report,
)
from .contract_audit import audit_stage5, write_stage5_audit
from .contracts import (
    DeadlineContract,
    load_contract_trace,
    render_contract_status,
    replay_contract,
    write_contract_report,
)
from .decision_audit import audit_stage8, write_stage8_audit
from .decision_campaign import run_decision_campaign, write_decision_campaign
from .decision_history import DecisionStore
from .decision_records import (
    record_hardware_recovery,
    record_recommendation,
    replay_decision,
)
from .evaluation import (
    evaluate_stage11,
    probe_scheduler_environment,
    write_evaluation,
    write_figure,
    write_scheduler_environment,
    write_tables,
)
from .evaluation_audit import audit_stage11, write_stage11_audit
from .explanations import explain_decision, render_explanation, render_replay
from .kernel_audit import audit_stage10, write_stage10_audit
from .kernel_instrumentation import (
    probe_kernel_capabilities,
    run_kernel_benchmark,
    write_json_report,
)
from .profile_analysis import analyze_profile, write_profile_analysis
from .profile_audit import audit_stage4, write_stage4_audit
from .profile_runner import run_profile_campaign
from .profiling import Instrumentation, load_profile, render_status, write_profile
from .recommendation import (
    load_recommendation_input,
    recommend,
    render_recommendation,
    write_recommendation,
)
from .recommendation_audit import audit_stage6, write_stage6_audit
from .recommendation_input import (
    build_recommendation_input,
    load_operations,
    write_recommendation_input,
)
from .recommendation_scenarios import run_recommendation_scenarios, write_scenario_suite
from .recovery import (
    load_recovery_trace,
    render_recovery,
    replay_recovery,
    write_recovery_report,
)
from .recovery_audit import audit_stage7, write_stage7_audit
from .recovery_closed_loop import run_hardware_recovery, write_hardware_recovery
from .recovery_evidence import (
    derive_recovery_evidence,
    load_json_object,
    write_recovery_evidence,
)
from .recovery_scenarios import run_recovery_scenarios, write_recovery_scenarios
from .runtime import parse_add_arguments, run_linux, run_rt
from .visualization_audit import audit_stage9, write_stage9_audit
from .visualization_campaign import (
    run_visualization_campaign,
    write_visualization_campaign,
)
from .visualization_runtime import set_view


def _parse_positive_ints(value: str) -> list[int]:
    try:
        parsed = [int(item.strip()) for item in value.split(",") if item.strip()]
    except ValueError as error:
        raise ValueError("expected a comma-separated list of positive integers") from error
    if not parsed or any(item < 1 for item in parsed):
        raise ValueError("expected a comma-separated list of positive integers")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="qf")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="build Linux ARM64 and RT MCU artifacts")
    build.add_argument("--root", type=Path, default=Path.cwd())

    abi = subparsers.add_parser("abi", help="validate the ABI schema and golden vectors")
    abi_subparsers = abi.add_subparsers(dest="abi_command", required=True)
    abi_check = abi_subparsers.add_parser("check", help="validate ABI declarations")
    abi_check.add_argument("--schema", type=Path, default=Path("config/qfabric-abi.json"))
    abi_vectors = abi_subparsers.add_parser("vectors", help="generate canonical golden vectors")
    abi_vectors.add_argument("--schema", type=Path, default=Path("config/qfabric-abi.json"))
    abi_vectors.add_argument("--output", type=Path, default=Path("abi/golden-vectors.json"))
    abi_generate = abi_subparsers.add_parser("generate", help="generate the C++ ABI codec")
    abi_generate.add_argument("--schema", type=Path, default=Path("config/qfabric-abi.json"))
    abi_generate.add_argument(
        "--output", type=Path, default=Path("generated/qfabric_abi.hpp")
    )
    abi_probe = abi_subparsers.add_parser("probe", help="verify the generated codec on the MCU")
    abi_probe.add_argument("--vectors", type=Path, default=Path("abi/golden-vectors.json"))
    abi_probe.add_argument("--output", type=Path, required=True)
    abi_probe.add_argument("--timeout", type=float, default=2.0)
    abi_probe.add_argument("--address", default="unix:///var/run/arduino-router.sock")
    abi_compile_fail = abi_subparsers.add_parser(
        "compile-fail", help="verify rejection of unsupported ABI declarations"
    )
    abi_compile_fail.add_argument(
        "--cases", type=Path, default=Path("tests/abi_compile_fail")
    )
    abi_audit = abi_subparsers.add_parser("audit", help="validate complete Stage 3 evidence")
    abi_audit.add_argument("--root", type=Path, default=Path.cwd())
    abi_audit.add_argument("--output", type=Path, required=True)
    abi_audit.add_argument("--timeout", type=float, default=2.0)
    abi_audit.add_argument("--address", default="unix:///var/run/arduino-router.sock")

    audit = subparsers.add_parser("audit", help="validate the complete Stage 2 evidence")
    audit.add_argument("--root", type=Path, default=Path.cwd())
    audit.add_argument("--output", type=Path, required=True)
    audit.add_argument("--timeout", type=float, default=2.0)
    audit.add_argument("--address", default="unix:///var/run/arduino-router.sock")

    run = subparsers.add_parser("run", help="run one QTask on an explicit execution domain")
    run.add_argument("task")
    run.add_argument("--domain", choices=("linux", "rt"), required=True)
    run.add_argument("--root", type=Path, default=Path.cwd())
    run.add_argument("--timeout", type=float, default=2.0)
    run.add_argument("--address", default="unix:///var/run/arduino-router.sock")

    recommend_command = subparsers.add_parser(
        "recommend", help="produce advisory static domain recommendations"
    )
    recommend_command.add_argument("task", nargs="?")
    recommend_command.add_argument(
        "--input", type=Path, default=Path(".qfabric/recommendation-input.json")
    )
    recommend_command.add_argument("--output", type=Path)
    recommend_command.add_argument("--json", action="store_true", dest="as_json")

    recommend_input = subparsers.add_parser(
        "recommend-input", help="derive recommendation input from Stage 5 evidence"
    )
    recommend_input.add_argument("--stage5-root", type=Path, required=True)
    recommend_input.add_argument(
        "--abi", type=Path, default=Path("config/qfabric-abi.json")
    )
    recommend_input.add_argument(
        "--operations", type=Path, default=Path("config/stage6-operations.json")
    )
    recommend_input.add_argument("--output", type=Path, required=True)

    recommend_scenarios = subparsers.add_parser(
        "recommend-scenarios", help="run positive and negative recommendation scenarios"
    )
    recommend_scenarios.add_argument("--input", type=Path, required=True)
    recommend_scenarios.add_argument("--output", type=Path, required=True)

    recommend_audit = subparsers.add_parser(
        "recommend-audit", help="validate complete Stage 6 recommendation evidence"
    )
    recommend_audit.add_argument("--root", type=Path, required=True)
    recommend_audit.add_argument("--stage5-root", type=Path, required=True)
    recommend_audit.add_argument(
        "--abi", type=Path, default=Path("config/qfabric-abi.json")
    )
    recommend_audit.add_argument(
        "--operations", type=Path, default=Path("config/stage6-operations.json")
    )
    recommend_audit.add_argument("--output", type=Path, required=True)

    recover = subparsers.add_parser("recover", help="evaluate safe closed-loop recovery traces")
    recover_subparsers = recover.add_subparsers(dest="recover_command", required=True)
    recover_replay = recover_subparsers.add_parser(
        "replay", help="deterministically replay a recovery trace"
    )
    recover_replay.add_argument("--input", type=Path, required=True)
    recover_replay.add_argument("--output", type=Path, required=True)
    recover_replay.add_argument("--json", action="store_true", dest="as_json")
    recover_scenarios = recover_subparsers.add_parser(
        "scenarios", help="run controlled recovery fault-injection scenarios"
    )
    recover_scenarios.add_argument("--output", type=Path, required=True)
    recover_evidence = recover_subparsers.add_parser(
        "evidence", help="join Stage 5 and Stage 6 evidence into one recovery observation"
    )
    recover_evidence.add_argument("--source-contract", type=Path, required=True)
    recover_evidence.add_argument("--recommendation", type=Path, required=True)
    recover_evidence.add_argument("--task", required=True)
    recover_evidence.add_argument("--safe-boundary", action="store_true")
    recover_evidence.add_argument("--target-contract", type=Path)
    recover_evidence.add_argument("--protected-contracts-unhealthy", action="store_true")
    recover_evidence.add_argument("--transient-misses", type=int, default=0)
    recover_evidence.add_argument("--output", type=Path, required=True)
    recover_hardware = recover_subparsers.add_parser(
        "hardware", help="run a bounded closed-loop hardware recovery campaign"
    )
    recover_hardware.add_argument("--recommendation-input", type=Path, required=True)
    recover_hardware.add_argument("--mode", choices=("success", "rollback"), required=True)
    recover_hardware.add_argument("--task", default="add")
    recover_hardware.add_argument("--root", type=Path, default=Path.cwd())
    recover_hardware.add_argument("--address", default="unix:///var/run/arduino-router.sock")
    recover_hardware.add_argument("--epoch", type=int)
    recover_hardware.add_argument("--invocations-per-window", type=int, default=20)
    recover_hardware.add_argument("--deadline-us", type=int, default=20_000)
    recover_hardware.add_argument("--injected-delay-us", type=int, default=20_000)
    recover_hardware.add_argument("--timeout", type=float, default=2.0)
    recover_hardware.add_argument("--output", type=Path, required=True)
    recover_audit = recover_subparsers.add_parser(
        "audit", help="validate complete Stage 7 deterministic and hardware evidence"
    )
    recover_audit.add_argument("--root", type=Path, required=True)
    recover_audit.add_argument("--recommendation-input", type=Path, required=True)
    recover_audit.add_argument("--output", type=Path, required=True)

    history = subparsers.add_parser(
        "history", help="persist immutable recommendation and recovery decisions"
    )
    history_subparsers = history.add_subparsers(dest="history_command", required=True)
    history_recommendation = history_subparsers.add_parser(
        "recommendation", help="record one Stage 6 recommendation"
    )
    history_recommendation.add_argument("--input", type=Path, required=True)
    history_recommendation.add_argument("--task", required=True)
    history_recommendation.add_argument(
        "--store", type=Path, default=Path(".qfabric/decisions.jsonl")
    )
    history_recovery = history_subparsers.add_parser(
        "recovery", help="record every decision in one Stage 7 hardware report"
    )
    history_recovery.add_argument("--input", type=Path, required=True)
    history_recovery.add_argument("--recommendation-input", type=Path, required=True)
    history_recovery.add_argument(
        "--store", type=Path, default=Path(".qfabric/decisions.jsonl")
    )
    history_campaign = history_subparsers.add_parser(
        "campaign", help="build the complete Stage 8 outcome-coverage history"
    )
    history_campaign.add_argument("--recommendation-input", type=Path, required=True)
    history_campaign.add_argument("--rollback-report", type=Path, required=True)
    history_campaign.add_argument("--store", type=Path, required=True)
    history_campaign.add_argument("--output", type=Path, required=True)
    history_audit = history_subparsers.add_parser(
        "audit", help="validate complete Stage 8 decision-history evidence"
    )
    history_audit.add_argument("--store", type=Path, required=True)
    history_audit.add_argument("--campaign", type=Path, required=True)
    history_audit.add_argument("--recommendation-input", type=Path, required=True)
    history_audit.add_argument("--rollback-report", type=Path, required=True)
    history_audit.add_argument("--output", type=Path, required=True)

    explain = subparsers.add_parser(
        "explain", help="explain an immutable persisted policy decision"
    )
    explain.add_argument("task")
    explain.add_argument("--decision", type=int)
    explain.add_argument(
        "--history", type=Path, default=Path(".qfabric/decisions.jsonl")
    )
    explain.add_argument("--json", action="store_true", dest="as_json")

    replay = subparsers.add_parser(
        "replay", help="recompute one immutable persisted policy decision"
    )
    replay.add_argument("--decision", type=int, required=True)
    replay.add_argument(
        "--history", type=Path, default=Path(".qfabric/decisions.jsonl")
    )
    replay.add_argument("--json", action="store_true", dest="as_json")

    view = subparsers.add_parser("view", help="drive the Stage 9 physical observability view")
    view.add_argument(
        "mode", choices=("placement", "contracts", "jitter", "ipc", "off")
    )
    view.add_argument("--task", default="add")
    view.add_argument("--decision", type=int)
    view.add_argument(
        "--history", type=Path, default=Path(".qfabric/decisions.jsonl")
    )
    view.add_argument("--refresh-hz", type=int, default=8)
    view.add_argument("--overlay-ms", type=int, default=500)
    view.add_argument("--timeout", type=float, default=2.0)
    view.add_argument("--address", default="unix:///var/run/arduino-router.sock")
    view.add_argument("--json", action="store_true", dest="as_json")

    view_campaign = subparsers.add_parser(
        "view-campaign", help="exercise every Stage 9 physical visualization state"
    )
    view_campaign.add_argument("--history", type=Path, required=True)
    view_campaign.add_argument("--refresh-hz", type=int, default=8)
    view_campaign.add_argument("--overlay-ms", type=int, default=100)
    view_campaign.add_argument("--timeout", type=float, default=2.0)
    view_campaign.add_argument("--address", default="unix:///var/run/arduino-router.sock")
    view_campaign.add_argument("--output", type=Path, required=True)

    view_audit = subparsers.add_parser(
        "view-audit", help="audit Stage 9 hardware coverage and overhead"
    )
    view_audit.add_argument("--campaign", type=Path, required=True)
    view_audit.add_argument(
        "--disabled-profile", type=Path, action="append", required=True
    )
    view_audit.add_argument(
        "--enabled-profile", type=Path, action="append", required=True
    )
    view_audit.add_argument("--maximum-p95-regression-pct", type=float, default=15.0)
    view_audit.add_argument("--output", type=Path, required=True)

    kernel = subparsers.add_parser(
        "kernel", help="inspect and benchmark optional Stage 10 kernel instrumentation"
    )
    kernel_subparsers = kernel.add_subparsers(dest="kernel_command", required=True)
    kernel_capabilities = kernel_subparsers.add_parser(
        "capabilities", help="report stock-kernel measurement interfaces"
    )
    kernel_capabilities.add_argument("--output", type=Path, required=True)
    kernel_benchmark = kernel_subparsers.add_parser(
        "benchmark", help="benchmark userspace or perf-counter attribution"
    )
    kernel_benchmark.add_argument("--root", type=Path, default=Path.cwd())
    kernel_benchmark.add_argument("--iterations", type=int, default=500)
    kernel_benchmark.add_argument("--warmup", type=int, default=50)
    kernel_benchmark.add_argument("--timeout", type=float, default=2.0)
    kernel_benchmark.add_argument("--baseline", action="store_true")
    kernel_benchmark.add_argument("--force-fallback", action="store_true")
    kernel_benchmark.add_argument("--include-kernel", action="store_true")
    kernel_benchmark.add_argument("--injected-delay-ms", type=int, default=0)
    kernel_benchmark.add_argument("--output", type=Path, required=True)
    kernel_audit = kernel_subparsers.add_parser(
        "audit", help="audit Stage 10 necessity, overhead, and safe fallback"
    )
    kernel_audit.add_argument("--capabilities", type=Path, required=True)
    kernel_audit.add_argument("--stage4-profile", type=Path, required=True)
    kernel_audit.add_argument("--baseline", type=Path, action="append", required=True)
    kernel_audit.add_argument("--perf", type=Path, action="append", required=True)
    kernel_audit.add_argument("--loaded-perf", type=Path, action="append", required=True)
    kernel_audit.add_argument("--accuracy", type=Path, required=True)
    kernel_audit.add_argument("--fallback", type=Path, required=True)
    kernel_audit.add_argument("--maximum-p95-overhead-pct", type=float, default=15.0)
    kernel_audit.add_argument("--output", type=Path, required=True)

    evaluate = subparsers.add_parser(
        "evaluate", help="run and audit the final Stage 11 evaluation"
    )
    evaluate_subparsers = evaluate.add_subparsers(
        dest="evaluate_command", required=True
    )
    evaluate_scheduler = evaluate_subparsers.add_parser(
        "scheduler", help="capture the active tuned-Linux scheduler environment"
    )
    evaluate_scheduler.add_argument("--output", type=Path, required=True)
    evaluate_run = evaluate_subparsers.add_parser(
        "run", help="evaluate applications and baselines from measured traces"
    )
    evaluate_run.add_argument("--root", type=Path, default=Path.cwd())
    evaluate_run.add_argument(
        "--applications",
        type=Path,
        default=Path("config/stage11-applications.json"),
    )
    evaluate_run.add_argument("--stage1", type=Path, action="append", required=True)
    evaluate_run.add_argument("--stage4-profile", type=Path, required=True)
    evaluate_run.add_argument(
        "--loaded-linux", type=Path, action="append", required=True
    )
    evaluate_run.add_argument("--tuned-profile", type=Path)
    evaluate_run.add_argument("--tuned-loaded-profile", type=Path)
    evaluate_run.add_argument("--scheduler", type=Path)
    evaluate_run.add_argument("--recovery-success", type=Path, required=True)
    evaluate_run.add_argument("--recovery-rollback", type=Path, required=True)
    evaluate_run.add_argument("--recommendation-input", type=Path, required=True)
    evaluate_run.add_argument(
        "--recommendation-scenarios", type=Path, required=True
    )
    evaluate_run.add_argument("--stage9-audit", type=Path, required=True)
    evaluate_run.add_argument("--stage10-audit", type=Path, required=True)
    evaluate_run.add_argument("--observations", type=int, default=1000)
    evaluate_run.add_argument("--output", type=Path, required=True)
    evaluate_run.add_argument("--table", type=Path, required=True)
    evaluate_run.add_argument("--figure", type=Path, required=True)
    evaluate_audit = evaluate_subparsers.add_parser(
        "audit", help="audit the complete Stage 11 evidence matrix"
    )
    evaluate_audit.add_argument("--input", type=Path, required=True)
    evaluate_audit.add_argument("--table", type=Path, required=True)
    evaluate_audit.add_argument("--figure", type=Path, required=True)
    evaluate_audit.add_argument("--output", type=Path, required=True)

    contract = subparsers.add_parser(
        "contract", help="evaluate an empirical soft real-time contract"
    )
    contract_subparsers = contract.add_subparsers(dest="contract_command", required=True)
    contract_replay = contract_subparsers.add_parser(
        "replay", help="deterministically replay a recorded contract trace"
    )
    contract_replay.add_argument("--input", type=Path, required=True)
    contract_replay.add_argument("--output", type=Path, required=True)
    contract_replay.add_argument("--json", action="store_true", dest="as_json")
    contract_trace = contract_subparsers.add_parser(
        "trace", help="convert one Stage 4 profile group into a contract trace"
    )
    contract_trace.add_argument("--profile", type=Path, required=True)
    contract_trace.add_argument("--task", default="add")
    contract_trace.add_argument("--domain", choices=("linux", "rt"), required=True)
    contract_trace.add_argument(
        "--mode", choices=("disabled", "reduced", "full"), default="full"
    )
    contract_trace.add_argument("--deadline-us", type=int, required=True)
    contract_trace.add_argument("--window-size", type=int, default=100)
    contract_trace.add_argument("--minimum-samples", type=int, default=20)
    contract_trace.add_argument("--warmup-samples", type=int, default=0)
    contract_trace.add_argument("--max-miss-rate-pct", type=float, default=1.0)
    contract_trace.add_argument("--at-risk-miss-rate-pct", type=float, default=0.5)
    contract_trace.add_argument("--recovery-miss-rate-pct", type=float, default=0.25)
    contract_trace.add_argument("--violation-windows", type=int, default=3)
    contract_trace.add_argument("--recovery-windows", type=int, default=3)
    contract_trace.add_argument("--infeasible-windows", type=int, default=5)
    contract_trace.add_argument("--output", type=Path, required=True)
    contract_sensitivity = contract_subparsers.add_parser(
        "sensitivity", help="compare window and hysteresis settings for a trace"
    )
    contract_sensitivity.add_argument("--input", type=Path, required=True)
    contract_sensitivity.add_argument("--window-sizes", default="20,50,100")
    contract_sensitivity.add_argument("--violation-windows", default="1,2,3")
    contract_sensitivity.add_argument("--recovery-windows", default="1,2,3")
    contract_sensitivity.add_argument("--output", type=Path, required=True)
    contract_scenario = contract_subparsers.add_parser(
        "scenario", help="inject and audit every contract-state transition"
    )
    contract_scenario.add_argument("--input", type=Path, required=True)
    contract_scenario.add_argument("--trace-output", type=Path, required=True)
    contract_scenario.add_argument("--report-output", type=Path, required=True)
    contract_audit = contract_subparsers.add_parser(
        "audit", help="validate complete Stage 5 hardware and transition evidence"
    )
    contract_audit.add_argument("--root", type=Path, required=True)
    contract_audit.add_argument("--output", type=Path, required=True)
    contract_audit.add_argument("--minimum-hardware-observations", type=int, default=1000)

    status = subparsers.add_parser("status", help="show the latest persisted QTask profile")
    status.add_argument("--input", type=Path, default=Path(".qfabric/profile.json"))
    status.add_argument("--json", action="store_true", dest="as_json")

    profile = subparsers.add_parser("profile", help="run a correlated QTask profile campaign")
    profile.add_argument("--domain", choices=("linux", "rt", "both"), default="both")
    profile.add_argument(
        "--mode", choices=("disabled", "reduced", "full", "all"), default="full"
    )
    profile.add_argument("--iterations", type=int, default=100)
    profile.add_argument("--warmup", type=int, default=10)
    profile.add_argument("--capacity", type=int, default=1024)
    profile.add_argument("--minimum-samples", type=int, default=20)
    profile.add_argument("--deadline-us", type=int, default=20_000)
    profile.add_argument("--epoch", type=int)
    profile.add_argument("--timeout", type=float, default=2.0)
    profile.add_argument("--address", default="unix:///var/run/arduino-router.sock")
    profile.add_argument("--root", type=Path, default=Path.cwd())
    profile.add_argument("--output", type=Path, default=Path(".qfabric/profile.json"))
    profile.add_argument("--json", action="store_true", dest="as_json")

    profile_analyze = subparsers.add_parser(
        "profile-analyze", help="independently verify profile metrics and overhead"
    )
    profile_analyze.add_argument("--input", type=Path, required=True)
    profile_analyze.add_argument("--output", type=Path, required=True)
    profile_analyze.add_argument("--tolerance-pct", type=float, default=0.01)

    profile_audit = subparsers.add_parser(
        "profile-audit", help="validate complete Stage 4 profiling evidence"
    )
    profile_audit.add_argument(
        "--overhead",
        type=Path,
        default=Path("data/processed/stage4/profile-overhead.json"),
    )
    profile_audit.add_argument(
        "--cold-start",
        type=Path,
        default=Path("data/processed/stage4/profile-cold-start.json"),
    )
    profile_audit.add_argument(
        "--output", type=Path, default=Path("data/processed/stage4/stage4-audit.json")
    )
    return parser


def _print_build(report: dict[str, object]) -> None:
    targets = report["targets"]
    for name in ("linux", "rt"):
        target = targets[name]
        marker = "PASS" if target["passed"] else "FAIL"
        print(f"[{marker}] {name}: {target['architecture']}")
        if not target["passed"] and target["stderr"]:
            print(target["stderr"].strip(), file=sys.stderr)
    print(f"build report: {report['report']}")


def main(argv: list[str] | None = None) -> int:
    raw_arguments = list(sys.argv[1:] if argv is None else argv)
    task_arguments: list[str] = []
    if "--" in raw_arguments:
        separator = raw_arguments.index("--")
        task_arguments = raw_arguments[separator + 1 :]
        raw_arguments = raw_arguments[:separator]
    args = build_parser().parse_args(raw_arguments)
    try:
        if args.command == "abi":
            if task_arguments:
                raise ValueError("qf abi does not accept task arguments")
            if args.abi_command == "check":
                schema = Schema.load(args.schema)
                print(
                    f"ABI schema valid: {len(schema.tasks)} tasks, "
                    f"{len(schema.types)} named types"
                )
                return 0
            if args.abi_command == "vectors":
                vectors = build_golden_vectors(args.schema)
                write_golden_vectors(vectors, args.output)
                print(f"golden vectors: {args.output}")
                return 0
            if args.abi_command == "probe":
                report = probe_mcu_abi(args.vectors, args.address, timeout=args.timeout)
                write_probe_report(report, args.output)
                print(f"Stage 3 MCU ABI probe: {report['status']}")
                print(f"probe report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.abi_command == "compile-fail":
                report = run_compile_fail_cases(args.cases)
                for case in report["cases"]:
                    marker = "PASS" if case["rejected"] else "FAIL"
                    print(f"[{marker}] {case['case']}: {case['diagnostic'] or 'accepted'}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.abi_command == "audit":
                report = audit_stage3(args.root.resolve(), args.address, timeout=args.timeout)
                write_stage3_audit(report, args.output)
                print(f"Stage 3 audit: {report['status']}")
                print(f"audit report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            header = generate_cpp_header(args.schema)
            write_cpp_header(header, args.output)
            print(f"generated C++ codec: {args.output}")
            return 0

        if args.command == "build":
            if task_arguments:
                raise ValueError("qf build does not accept task arguments")
            report = build_stage2(args.root.resolve())
            _print_build(report)
            return 0 if report["status"] == "pass" else 1

        if args.command == "audit":
            if task_arguments:
                raise ValueError("qf audit does not accept task arguments")
            result = audit_stage2(args.root.resolve(), args.address, timeout=args.timeout)
            write_audit(result, args.output)
            print(f"Stage 2 audit: {result['status']}")
            print(f"audit report: {args.output}")
            for failure in result["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if result["status"] == "pass" else 1

        if args.command == "recommend":
            if task_arguments:
                raise ValueError("qf recommend does not accept task arguments after --")
            source = load_recommendation_input(args.input)
            report = recommend(source, task_filter=args.task)
            if args.output is not None:
                write_recommendation(report, args.output)
            print(
                json.dumps(report, indent=2, sort_keys=True)
                if args.as_json
                else render_recommendation(report)
            )
            if args.output is not None:
                print(f"recommendation report: {args.output}")
            return 0

        if args.command == "recommend-input":
            if task_arguments:
                raise ValueError("qf recommend-input does not accept task arguments")
            operations = load_operations(args.operations)
            document = build_recommendation_input(args.stage5_root, args.abi, operations)
            write_recommendation_input(document, args.output)
            print(f"recommendation input: {args.output}")
            return 0

        if args.command == "recommend-scenarios":
            if task_arguments:
                raise ValueError("qf recommend-scenarios does not accept task arguments")
            source = load_recommendation_input(args.input)
            report = run_recommendation_scenarios(source)
            write_scenario_suite(report, args.output)
            print(f"Stage 6 recommendation scenarios: {report['status']}")
            print(f"scenario report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "recommend-audit":
            if task_arguments:
                raise ValueError("qf recommend-audit does not accept task arguments")
            report = audit_stage6(
                args.root,
                args.stage5_root,
                args.abi,
                args.operations,
            )
            write_stage6_audit(report, args.output)
            print(f"Stage 6 audit: {report['status']}")
            print(f"audit report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "recover":
            if task_arguments:
                raise ValueError("qf recover does not accept task arguments")
            if args.recover_command == "scenarios":
                report = run_recovery_scenarios()
                write_recovery_scenarios(report, args.output)
                print(f"Stage 7 recovery scenarios: {report['status']}")
                print(f"scenario report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.recover_command == "evidence":
                source_contract = load_json_object(args.source_contract)
                recommendation = load_json_object(args.recommendation)
                target_contract = (
                    None
                    if args.target_contract is None
                    else load_json_object(args.target_contract)
                )
                evidence = derive_recovery_evidence(
                    source_contract,
                    recommendation,
                    task=args.task,
                    safe_boundary=args.safe_boundary,
                    target_contract=target_contract,
                    protected_contracts_healthy=(
                        not args.protected_contracts_unhealthy
                    ),
                    transient_misses=args.transient_misses,
                )
                write_recovery_evidence(evidence, args.output)
                print(f"recovery evidence: {args.output}")
                return 0
            if args.recover_command == "hardware":
                recommendation_input = load_recommendation_input(
                    args.recommendation_input
                )
                epoch = int(time.time()) & 0xFFFFFFFF if args.epoch is None else args.epoch
                report = run_hardware_recovery(
                    args.root.resolve(),
                    args.address,
                    recommendation_input,
                    mode=args.mode,
                    task=args.task,
                    initial_epoch=epoch,
                    invocations_per_window=args.invocations_per_window,
                    deadline_ns=args.deadline_us * 1_000,
                    injected_delay_ns=args.injected_delay_us * 1_000,
                    timeout=args.timeout,
                )
                write_hardware_recovery(report, args.output)
                print(f"Stage 7 hardware recovery ({args.mode}): {report['status']}")
                print(f"hardware report: {args.output}")
                for failure in report["failures"]:
                    print(f"- failed check: {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.recover_command == "audit":
                report = audit_stage7(args.root, args.recommendation_input)
                write_stage7_audit(report, args.output)
                print(f"Stage 7 audit: {report['status']}")
                print(f"audit report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            policy, initial_domain, initial_epoch, observations = load_recovery_trace(
                args.input
            )
            report = replay_recovery(
                policy,
                observations,
                initial_domain=initial_domain,
                initial_epoch=initial_epoch,
            )
            write_recovery_report(report, args.output)
            print(
                json.dumps(report, indent=2, sort_keys=True)
                if args.as_json
                else render_recovery(report)
            )
            print(f"recovery report: {args.output}")
            return 0

        if args.command == "history":
            if task_arguments:
                raise ValueError("qf history does not accept task arguments")
            if args.history_command == "audit":
                source = load_recommendation_input(args.recommendation_input)
                rollback = load_json_object(args.rollback_report)
                report = audit_stage8(
                    args.store,
                    args.campaign,
                    source,
                    rollback,
                )
                write_stage8_audit(report, args.output)
                print(f"Stage 8 audit: {report['status']}")
                print(f"audit report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.history_command == "campaign":
                source = load_recommendation_input(args.recommendation_input)
                rollback = load_json_object(args.rollback_report)
                report = run_decision_campaign(args.store, source, rollback)
                write_decision_campaign(report, args.output)
                print(f"Stage 8 decision campaign: {report['status']}")
                print(f"decision history: {args.store}")
                print(f"campaign report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            store = DecisionStore(args.store)
            if args.history_command == "recommendation":
                source = load_recommendation_input(args.input)
                record = record_recommendation(store, source, task=args.task)
                print(
                    f"recorded recommendation decision {record['decision_id']}: "
                    f"{record['record_sha256']}"
                )
                return 0
            hardware = load_json_object(args.input)
            source = load_recommendation_input(args.recommendation_input)
            records = record_hardware_recovery(store, hardware, source)
            print(
                f"recorded {len(records)} recovery decisions: "
                f"{records[0]['decision_id']}..{records[-1]['decision_id']}"
            )
            return 0

        if args.command == "explain":
            if task_arguments:
                raise ValueError("qf explain does not accept task arguments")
            store = DecisionStore(args.history)
            record = (
                store.latest(args.task)
                if args.decision is None
                else store.get(args.decision)
            )
            if record["task"] != args.task:
                raise ValueError(
                    f"decision {record['decision_id']} belongs to task {record['task']}"
                )
            explanation = explain_decision(record)
            print(
                json.dumps(explanation, indent=2, sort_keys=True)
                if args.as_json
                else render_explanation(explanation)
            )
            return 0

        if args.command == "replay":
            if task_arguments:
                raise ValueError("qf replay does not accept task arguments")
            record = DecisionStore(args.history).get(args.decision)
            report = replay_decision(record)
            print(
                json.dumps(report, indent=2, sort_keys=True)
                if args.as_json
                else render_replay(report)
            )
            return 0 if report["matches"] else 1

        if args.command == "view":
            if task_arguments:
                raise ValueError("qf view does not accept task arguments")
            report = set_view(
                args.mode,
                history=args.history,
                task=args.task,
                decision_id=args.decision,
                address=args.address,
                refresh_hz=args.refresh_hz,
                overlay_ms=args.overlay_ms,
                timeout=args.timeout,
            )
            if args.as_json:
                print(json.dumps(report, indent=2, sort_keys=True))
            else:
                decision = report["decision_id"]
                print(f"QFabric physical view: {report['mode']}")
                print(f"- decision: {decision if decision is not None else 'none'}")
                print(f"- applied frames: {report['diagnostics']['applied_frames']}")
                print(f"- changed pixels: {report['diagnostics']['changed_pixels']}")
                print(f"- maximum draw: {report['diagnostics']['maximum_draw_us']} us")
            return 0

        if args.command == "view-campaign":
            if task_arguments:
                raise ValueError("qf view-campaign does not accept task arguments")
            report = run_visualization_campaign(
                args.history,
                args.address,
                refresh_hz=args.refresh_hz,
                overlay_ms=args.overlay_ms,
                timeout=args.timeout,
            )
            write_visualization_campaign(report, args.output)
            print(f"Stage 9 visualization campaign: {report['status']}")
            print(f"campaign report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "view-audit":
            if task_arguments:
                raise ValueError("qf view-audit does not accept task arguments")
            report = audit_stage9(
                args.campaign,
                args.disabled_profile,
                args.enabled_profile,
                maximum_p95_regression_pct=args.maximum_p95_regression_pct,
            )
            write_stage9_audit(report, args.output)
            print(f"Stage 9 audit: {report['status']}")
            print(f"audit report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "kernel":
            if task_arguments:
                raise ValueError("qf kernel does not accept task arguments")
            if args.kernel_command == "capabilities":
                report = probe_kernel_capabilities()
                write_json_report(report, args.output)
                print(f"Stage 10 kernel capabilities: {report['selection']['mechanism']}")
                print(f"capability report: {args.output}")
                return 0
            if args.kernel_command == "benchmark":
                report = run_kernel_benchmark(
                    args.root.resolve(),
                    iterations=args.iterations,
                    warmup=args.warmup,
                    timeout=args.timeout,
                    force_fallback=args.force_fallback,
                    baseline=args.baseline,
                    include_kernel=args.include_kernel,
                    injected_delay_ns=args.injected_delay_ms * 1_000_000,
                )
                write_json_report(report, args.output)
                print(f"Stage 10 kernel benchmark ({report['mode']}): {report['status']}")
                print(f"benchmark report: {args.output}")
                return 0 if report["status"] == "pass" else 1
            report = audit_stage10(
                args.capabilities,
                args.stage4_profile,
                args.baseline,
                args.perf,
                args.loaded_perf,
                args.accuracy,
                args.fallback,
                maximum_p95_overhead_pct=args.maximum_p95_overhead_pct,
            )
            write_stage10_audit(report, args.output)
            print(f"Stage 10 audit: {report['status']}")
            print(f"audit report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "evaluate":
            if task_arguments:
                raise ValueError("qf evaluate does not accept task arguments")
            if args.evaluate_command == "scheduler":
                report = probe_scheduler_environment()
                write_scheduler_environment(report, args.output)
                state = (
                    "available"
                    if report["sched_fifo"]["available"]
                    else "unavailable"
                )
                print(f"Stage 11 SCHED_FIFO baseline: {state}")
                print(f"scheduler report: {args.output}")
                return 0
            if args.evaluate_command == "run":
                report = evaluate_stage11(
                    args.root.resolve(),
                    applications_path=args.applications,
                    stage1_paths=args.stage1,
                    stage4_profile_path=args.stage4_profile,
                    loaded_linux_paths=args.loaded_linux,
                    tuned_profile_path=args.tuned_profile,
                    tuned_loaded_profile_path=args.tuned_loaded_profile,
                    scheduler_path=args.scheduler,
                    recovery_success_path=args.recovery_success,
                    recovery_rollback_path=args.recovery_rollback,
                    recommendation_input_path=args.recommendation_input,
                    recommendation_scenarios_path=args.recommendation_scenarios,
                    stage9_audit_path=args.stage9_audit,
                    stage10_audit_path=args.stage10_audit,
                    observations=args.observations,
                )
                write_evaluation(report, args.output)
                write_tables(report, args.table)
                write_figure(report, args.figure)
                print(
                    f"Stage 11 evaluation: {len(report['results'])} application cells, "
                    f"{len(report['flagship']['results'])} flagship cells"
                )
                print(f"evaluation report: {args.output}")
                return 0
            report = audit_stage11(args.input, args.table, args.figure)
            write_stage11_audit(report, args.output)
            print(f"Stage 11 audit: {report['status']}")
            print(f"audit report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.command == "contract":
            if task_arguments:
                raise ValueError("qf contract does not accept task arguments")
            if args.contract_command == "audit":
                report = audit_stage5(
                    args.root,
                    minimum_hardware_observations=args.minimum_hardware_observations,
                )
                write_stage5_audit(report, args.output)
                print(f"Stage 5 audit: {report['status']}")
                print(f"audit report: {args.output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.contract_command == "trace":
                contract = DeadlineContract(
                    deadline_ns=args.deadline_us * 1_000,
                    window_size=args.window_size,
                    minimum_samples=args.minimum_samples,
                    warmup_samples=args.warmup_samples,
                    max_miss_rate_pct=args.max_miss_rate_pct,
                    at_risk_miss_rate_pct=args.at_risk_miss_rate_pct,
                    recovery_miss_rate_pct=args.recovery_miss_rate_pct,
                    violation_windows=args.violation_windows,
                    recovery_windows=args.recovery_windows,
                    infeasible_windows=args.infeasible_windows,
                )
                profile = load_profile(args.profile)
                trace = profile_group_to_trace(
                    profile,
                    contract,
                    task=args.task,
                    domain=args.domain,
                    instrumentation=args.mode,
                )
                write_contract_trace(trace, args.output)
                print(
                    f"contract trace: {args.output} "
                    f"({len(trace['observations'])} observations)"
                )
                return 0
            contract, observations = load_contract_trace(args.input)
            if args.contract_command == "scenario":
                trace = build_transition_scenario(contract, observations)
                write_contract_trace(trace, args.trace_output)
                report = audit_transition_scenario(trace)
                write_scenario_report(report, args.report_output)
                print(f"Stage 5 transition scenario: {report['status']}")
                print(f"injected trace: {args.trace_output}")
                print(f"scenario report: {args.report_output}")
                for failure in report["failures"]:
                    print(f"- {failure}", file=sys.stderr)
                return 0 if report["status"] == "pass" else 1
            if args.contract_command == "sensitivity":
                report = analyze_contract_sensitivity(
                    contract,
                    observations,
                    window_sizes=_parse_positive_ints(args.window_sizes),
                    violation_windows=_parse_positive_ints(args.violation_windows),
                    recovery_windows=_parse_positive_ints(args.recovery_windows),
                )
                write_sensitivity_report(report, args.output)
                print(
                    f"contract sensitivity: {report['configuration_count']} configurations"
                )
                print(f"sensitivity report: {args.output}")
                return 0
            report = replay_contract(contract, observations)
            write_contract_report(report, args.output)
            rendered = (
                json.dumps(report, indent=2, sort_keys=True)
                if args.as_json
                else render_contract_status(report)
            )
            print(rendered)
            print(f"contract report: {args.output}")
            return 0

        if args.command == "status":
            if task_arguments:
                raise ValueError("qf status does not accept task arguments")
            report = load_profile(args.input)
            if args.as_json:
                print(json.dumps(report, indent=2, sort_keys=True))
            else:
                print(render_status(report))
            return 0

        if args.command == "profile":
            if task_arguments:
                raise ValueError("qf profile does not accept task arguments")
            domains = ("linux", "rt") if args.domain == "both" else (args.domain,)
            modes = (
                tuple(Instrumentation)
                if args.mode == "all"
                else (Instrumentation(args.mode),)
            )
            epoch = args.epoch if args.epoch is not None else int(time.time()) & 0xFFFFFFFF
            report = run_profile_campaign(
                args.root.resolve(),
                args.address,
                domains=domains,
                modes=modes,
                iterations=args.iterations,
                warmup=args.warmup,
                capacity=args.capacity,
                minimum_samples=args.minimum_samples,
                deadline_ns=args.deadline_us * 1_000,
                epoch=epoch,
                timeout=args.timeout,
            )
            write_profile(report, args.output)
            rendered = (
                json.dumps(report, indent=2, sort_keys=True)
                if args.as_json
                else render_status(report)
            )
            print(rendered)
            print(f"profile report: {args.output}")
            return 0

        if args.command == "profile-analyze":
            if task_arguments:
                raise ValueError("qf profile-analyze does not accept task arguments")
            report = load_profile(args.input)
            analysis = analyze_profile(report, tolerance_pct=args.tolerance_pct)
            write_profile_analysis(analysis, args.output)
            print(f"Stage 4 profile analysis: {analysis['status']}")
            print(f"analysis report: {args.output}")
            for overhead in analysis["instrumentation_overhead"]:
                print(
                    f"- {overhead['domain']}/{overhead['mode']}: "
                    f"mean {overhead['mean_delta_pct']:+.3f}%, "
                    f"p95 {overhead['p95_delta_pct']:+.3f}%"
                )
            for failure in analysis["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if analysis["status"] == "pass" else 1

        if args.command == "profile-audit":
            if task_arguments:
                raise ValueError("qf profile-audit does not accept task arguments")
            report = audit_stage4(args.overhead, args.cold_start)
            write_stage4_audit(report, args.output)
            print(f"Stage 4 audit: {report['status']}")
            print(f"audit report: {args.output}")
            for failure in report["failures"]:
                print(f"- {failure}", file=sys.stderr)
            return 0 if report["status"] == "pass" else 1

        if args.task != "add":
            raise ValueError(f"unknown QTask: {args.task}")
        a, b = parse_add_arguments(task_arguments)
        if args.domain == "linux":
            result = run_linux(args.root.resolve(), a, b)
        else:
            result = run_rt(args.address, a, b, timeout=args.timeout)
        print(result)
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
