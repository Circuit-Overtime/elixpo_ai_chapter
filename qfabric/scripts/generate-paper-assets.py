#!/usr/bin/env python3
"""Generate manuscript tables and plotting data from the audited Stage 11 report."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/processed/stage11/stage11-evaluation-01/evaluation.json"
OUT = ROOT / "paper/generated"


def esc(value: str) -> str:
    return value.replace("_", r"\_").replace("%", r"\%")


def fmt_ms(ns: float) -> str:
    return f"{ns / 1_000_000:.2f}"


def macro(name: str, value: object) -> str:
    return rf"\newcommand{{\{name}}}{{{value}}}" + "\n"


def main() -> None:
    report = json.loads(SOURCE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    flagship = report["flagship"]["results"]
    with (OUT / "flagship.dat").open("w", encoding="utf-8") as handle:
        handle.write("baseline p95_ms miss_rate_pct\n")
        for row in flagship:
            handle.write(
                f"{row['baseline']} {row['p95_ns'] / 1_000_000:.6f} "
                f"{row['miss_rate_pct']:.6f}\n"
            )

    app_rows = report["results"]
    with (OUT / "idle-applications.dat").open("w", encoding="utf-8") as handle:
        handle.write("application baseline p95_ms\n")
        for row in app_rows:
            handle.write(
                f"{row['application']} {row['baseline']} "
                f"{row['p95_ns'] / 1_000_000:.6f}\n"
            )

    table_lines = [
        r"\begin{tabular}{lrrr}",
        r"\toprule",
        r"Baseline & p95 (ms) & Miss rate (\%) & Placement \\",
        r"\midrule",
    ]
    for row in flagship:
        if row["baseline"] == "qfabric-recovery":
            placement = "adaptive"
        elif isinstance(row["placement"], str):
            placement = "per observation"
        else:
            placement = "/".join("L" if d == "linux" else "R" for d in row["placement"])
        table_lines.append(
            f"{esc(row['baseline'])} & {fmt_ms(row['p95_ns'])} & "
            f"{row['miss_rate_pct']:.1f} & {placement} \\\\"
        )
    table_lines.extend([r"\bottomrule", r"\end{tabular}"])
    (OUT / "flagship-table.tex").write_text("\n".join(table_lines) + "\n", encoding="utf-8")

    cfg = report["configuration"]
    rq = report["research_questions"]
    overheads = report["overheads"]
    values = "".join(
        [
            macro(
                "DerivedDeadlineMs",
                f"{cfg['deadline_derivation']['deadline_ns'] / 1_000_000:.0f}",
            ),
            macro("DeadlineSafetyFactor", cfg["deadline_derivation"]["safety_factor"]),
            macro("ObservationsPerCell", cfg["observations_per_cell"]),
            macro("RecoveryImprovement", f"{rq['RQ2']['flagship_p95_improvement_pct']:.1f}\\%"),
            macro("RecoveryOracleRatio", f"{rq['RQ4']['recovery_to_oracle_p95_ratio']:.2f}"),
            macro("RecoveryTunedRatio", f"{rq['RQ4']['recovery_to_tuned_linux_p95_ratio']:.2f}"),
            macro("PolicyCpuP", f"{overheads['policy']['cpu_time_ns']['p95'] / 1_000:.1f}"),
            macro("PolicyWallP", f"{overheads['policy']['wall_time_ns']['p95'] / 1_000:.1f}"),
            macro("PolicyPeakBytes", overheads["policy"]["traced_peak_bytes_single_decision"]),
            macro("LinuxCommP", f"{overheads['communication']['linux']['p95_ns'] / 1_000_000:.2f}"),
            macro("RtCommP", f"{overheads['communication']['rt']['p95_ns'] / 1_000_000:.2f}"),
            macro(
                "KernelOverhead",
                f"{overheads['optional_kernel_instrumentation_p95_delta_pct']:.2f}\\%",
            ),
            macro("VisualizationOverhead", f"{overheads['visualization_p95_delta_pct']:.2f}\\%"),
        ]
    )
    (OUT / "metrics.tex").write_text(values, encoding="utf-8")

    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    manifest = {
        "schema_version": 1,
        "source": str(SOURCE.relative_to(ROOT)),
        "source_sha256": digest,
        "outputs": sorted(p.name for p in OUT.iterdir() if p.name != "manifest.json"),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
