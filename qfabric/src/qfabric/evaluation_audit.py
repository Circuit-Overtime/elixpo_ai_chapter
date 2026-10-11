from __future__ import annotations

import csv
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .evaluation import BASELINES


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def audit_stage11(
    evaluation_path: Path,
    table_path: Path,
    figure_path: Path,
) -> dict[str, Any]:
    report = _load(evaluation_path)
    failures: list[str] = []
    checks: dict[str, bool] = {}

    applications = report.get("applications", [])
    app_names = {app["name"] for app in applications}
    checks["four_required_applications"] = (
        len(applications) == 4
        and {app["kind"] for app in applications}
        == {
            "controlled-synthetic-chain",
            "signal-processing-pipeline",
            "closed-loop-control-simulation",
            "network-connected-linux-edge-pipeline",
        }
    )
    rows = report.get("results", [])
    row_keys = {(row["application"], row["baseline"]) for row in rows}
    checks["complete_application_baseline_matrix"] = row_keys == {
        (application, baseline)
        for application in app_names
        for baseline in BASELINES
    }
    flagship = report.get("flagship", {}).get("results", [])
    checks["complete_flagship_baseline_matrix"] = {
        row["baseline"] for row in flagship
    } == set(BASELINES)
    oracle_dominates = True
    for group in [
        [row for row in rows if row["application"] == application]
        for application in app_names
    ] + [flagship]:
        by_baseline = {
            row["baseline"]: row
            for row in group
            if row.get("status") == "measured-trace-replay"
        }
        oracle = by_baseline.get("offline-oracle")
        if oracle is None:
            oracle_dominates = False
            continue
        oracle_dominates = oracle_dominates and all(
            oracle["p95_ns"] <= by_baseline[baseline]["p95_ns"]
            for baseline in (
                "ordinary-linux",
                "static-mcu-first",
                "manual-expert",
                "qfabric-static",
                "qfabric-recovery",
            )
            if baseline in by_baseline
        )
    checks["offline_oracle_is_upper_bound"] = oracle_dominates
    checks["tuned_linux_measured_or_explicitly_unavailable"] = all(
        row.get("status") in {"measured-trace-replay", "unavailable"}
        for row in rows + flagship
        if row["baseline"] == "tuned-linux"
    )

    deadline = report["configuration"]["deadline_derivation"]
    checks["deadline_derived_from_stage1"] = (
        len(deadline["source_values_ns"]) >= 3
        and deadline["post_hoc_tuned"] is False
        and deadline["deadline_ns"] > deadline["maximum_ns"]
        and deadline["safety_factor"] == 1.25
    )
    checks["fixed_seed_and_no_cherry_picking"] = (
        report["configuration"]["observations_per_cell"] >= 100
        and isinstance(report["configuration"]["seed"], int)
        and all(
            row.get("observations")
            == report["configuration"]["observations_per_cell"]
            for row in rows + flagship
            if row.get("status") == "measured-trace-replay"
        )
    )
    coverage = report["coverage"]
    checks["positive_negative_infeasible_rollback_covered"] = all(
        coverage[key]
        for key in (
            "positive_hardware_recovery",
            "rollback_hardware_recovery",
            "infeasible_scenario",
            "negative_safety_scenarios",
        )
    )
    checks["six_research_questions_answered"] = set(
        report.get("research_questions", {})
    ) == {f"RQ{index}" for index in range(1, 7)}
    checks["claim_boundary_is_empirical"] = (
        report["claim"]
        == "safe-closed-loop-recovery-of-empirical-timing-contracts"
        and report["evidence_scope"]["hard_real_time_claimed"] is False
        and "replay" in report["evidence_scope"]["application_evaluation"]
    )
    checks["source_manifest_valid"] = bool(report["source_manifest"]) and all(
        Path(item["path"]).is_file()
        and _sha256(Path(item["path"])) == item["sha256"]
        for item in report["source_manifest"]
    )
    checks["paper_table_regenerable"] = table_path.is_file()
    if table_path.is_file():
        with table_path.open(encoding="utf-8", newline="") as source:
            table_rows = list(csv.DictReader(source))
        checks["paper_table_regenerable"] = len(table_rows) == len(rows) + len(flagship)
    checks["paper_figure_regenerable"] = (
        figure_path.is_file()
        and figure_path.read_text(encoding="utf-8").startswith("<svg")
    )
    checks["effort_comparison_labeled_proxy"] = (
        report["programmer_effort"]["line_reduction_pct"] > 0
        and "not a user study" in report["programmer_effort"]["method"]
    )
    checks["physical_view_uses_prior_audited_trace"] = (
        "visualization_p95_delta_pct" in report["overheads"]
    )
    checks["overheads_quantified"] = (
        report["overheads"]["policy"]["cpu_time_ns"]["p95"] > 0
        and report["overheads"]["policy"]["traced_peak_bytes_single_decision"] > 0
        and set(report["overheads"]["profiling"]) == {"linux", "rt"}
        and set(report["overheads"]["communication"]) == {"linux", "rt"}
        and report["overheads"]["stabilization"]["commit_window"]
        > report["overheads"]["stabilization"]["switch_window"]
    )
    checks["scheduler_baseline_disclosure_complete"] = all(
        name in report["scheduler_baselines"]
        for name in ("sched_fifo", "sched_deadline", "preempt_rt")
    )
    checks["hardware_recovery_evidence_complete"] = (
        report["flagship"]["hardware_success_status"] == "pass"
        and report["flagship"]["hardware_rollback_status"] == "pass"
        and report["flagship"]["hardware_rollbacks"] >= 1
    )
    for name, passed in checks.items():
        if not passed:
            failures.append(name.replace("_", " "))
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 11,
        "claim": report.get("claim"),
        "status": "pass" if not failures else "fail",
        "checks": checks,
        "application_count": len(applications),
        "application_result_cells": len(rows),
        "flagship_result_cells": len(flagship),
        "research_questions": report.get("research_questions", {}),
        "failures": failures,
    }


def write_stage11_audit(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
