from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class CampaignRequirement:
    name: str
    processed: str
    raw: str
    json_files: int
    measurements: int
    stress_log: bool = False


CAMPAIGNS = (
    CampaignRequirement(
        "schedutil idle baseline",
        "data/processed/campaigns/idle/stage1b-directional-idle",
        "data/raw/campaigns/idle/stage1b-directional-idle",
        12,
        24_000,
    ),
    CampaignRequirement(
        "schedutil loaded baseline",
        "data/processed/campaigns/cpu-loaded/stage1b-directional-cpu-loaded",
        "data/raw/campaigns/cpu-loaded/stage1b-directional-cpu-loaded",
        12,
        24_000,
        True,
    ),
    CampaignRequirement(
        "performance idle baseline",
        "data/processed/campaigns/idle-performance/stage1-performance-idle",
        "data/raw/campaigns/idle-performance/stage1-performance-idle",
        12,
        24_000,
    ),
    CampaignRequirement(
        "performance loaded baseline",
        "data/processed/campaigns/cpu-loaded-performance/stage1-performance-cpu-loaded",
        "data/raw/campaigns/cpu-loaded-performance/stage1-performance-cpu-loaded",
        12,
        24_000,
        True,
    ),
    CampaignRequirement(
        "idle concurrency",
        "data/processed/concurrency/idle/stage1-concurrency-idle",
        "data/raw/concurrency/idle/stage1-concurrency-idle",
        12,
        12_000,
    ),
    CampaignRequirement(
        "loaded concurrency",
        "data/processed/concurrency/cpu-loaded/stage1-concurrency-cpu-loaded",
        "data/raw/concurrency/cpu-loaded/stage1-concurrency-cpu-loaded",
        12,
        12_000,
        True,
    ),
    CampaignRequirement(
        "idle LED profiles",
        "data/processed/led-profiles/stage1-led-profiles-idle",
        "data/raw/led-profiles/stage1-led-profiles-idle",
        15,
        15_000,
    ),
    CampaignRequirement(
        "idle clock alignment",
        "data/processed/clock-alignment/stage1-clock-alignment-idle",
        "data/raw/clock-alignment/stage1-clock-alignment-idle",
        3,
        1_800,
    ),
)


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} does not contain a JSON object")
    return value


def audit_stage1(root: Path) -> dict[str, object]:
    checks: list[dict[str, object]] = []

    def record(name: str, passed: bool, detail: str) -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})

    measured_total = 0
    failed_total = 0
    for campaign in CAMPAIGNS:
        processed_root = root / campaign.processed
        raw_root = root / campaign.raw
        json_paths = sorted(processed_root.glob("**/*.json")) if processed_root.is_dir() else []
        campaign_total = 0
        campaign_failures = 0
        parse_error: str | None = None
        for path in json_paths:
            try:
                document = _read_json(path)
                if document.get("schema_version") != 1:
                    raise ValueError(f"{path} has an unsupported schema version")
                groups = document.get("groups")
                if not isinstance(groups, list):
                    raise ValueError(f"{path} has no groups list")
                for group in groups:
                    if not isinstance(group, dict):
                        raise ValueError(f"{path} contains a non-object group")
                    campaign_total += int(group["total"])
                    campaign_failures += int(group["failures"])
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
                parse_error = str(error)
                break

        passed = (
            parse_error is None
            and len(json_paths) == campaign.json_files
            and campaign_total == campaign.measurements
            and campaign_failures == 0
        )
        detail = (
            parse_error
            or f"{len(json_paths)} summaries, {campaign_total} samples, "
            f"{campaign_failures} failures"
        )
        record(f"campaign: {campaign.name}", passed, detail)
        measured_total += campaign_total
        failed_total += campaign_failures

        metadata_ok = all(
            (raw_root / name).is_file() for name in ("campaign.txt", "environment.txt")
        )
        record(
            f"metadata: {campaign.name}",
            metadata_ok,
            "campaign.txt and environment.txt present" if metadata_ok else "metadata missing",
        )

        raw_paths = sorted(raw_root.glob("**/*.jsonl")) if raw_root.is_dir() else []
        raw_samples = 0
        raw_failures = 0
        raw_error: str | None = None
        for path in raw_paths:
            try:
                with path.open(encoding="utf-8") as stream:
                    for line_number, line in enumerate(stream, start=1):
                        if not line.strip():
                            continue
                        sample = json.loads(line)
                        if not isinstance(sample, dict) or sample.get("schema_version") != 1:
                            raise ValueError(f"{path}:{line_number} has an invalid schema")
                        raw_samples += 1
                        raw_failures += sample.get("outcome") != "ok"
            except (OSError, ValueError, json.JSONDecodeError) as error:
                raw_error = str(error)
                break
        raw_ok = (
            raw_error is None
            and len(raw_paths) == campaign.json_files
            and raw_samples == campaign.measurements
            and raw_failures == 0
        )
        record(
            f"raw measurements: {campaign.name}",
            raw_ok,
            raw_error
            or f"{len(raw_paths)} JSONL files, {raw_samples} samples, {raw_failures} failures",
        )
        if campaign.stress_log:
            stress_path = raw_root / "stress-ng.log"
            stress_text = stress_path.read_text(encoding="utf-8") if stress_path.is_file() else ""
            stress_ok = "failed: 0" in stress_text and "successful run completed" in stress_text
            record(
                f"load evidence: {campaign.name}",
                stress_ok,
                "stress-ng reports zero failures" if stress_ok else "valid stress-ng log missing",
            )

    record(
        "aggregate measurement count",
        measured_total == 136_800 and failed_total == 0,
        f"{measured_total} samples, {failed_total} failures",
    )

    resource_patterns = (
        ("concurrency", "data/raw/concurrency/**/*-after.json", 24, 1101),
        ("LED profiles", "data/raw/led-profiles/**/*-after.json", 15, 1107),
        ("clock alignment", "data/raw/clock-alignment/**/*-after.json", 3, 611),
    )
    for name, pattern, expected_files, expected_requests in resource_patterns:
        paths = sorted(root.glob(pattern))
        valid = 0
        for path in paths:
            try:
                snapshot = _read_json(path)
                constants = snapshot["constants"]
                diagnostics = snapshot["diagnostics"]
                limitations = snapshot["limitations"]
                if (
                    constants["kernel_heap_capacity_bytes"] == 32768
                    and constants["main_stack_capacity_bytes"] == 32768
                    and constants["rpc_request_buffer_bytes"] == 256
                    and diagnostics["requests_since_reset"] == expected_requests
                    and limitations["runtime_allocation_probe"]
                    == "disabled-unsafe-on-stock-uno-q"
                ):
                    valid += 1
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
        record(
            f"resource diagnostics: {name}",
            len(paths) == expected_files and valid == expected_files,
            f"{valid}/{expected_files} valid post-workload snapshots",
        )

    build_path = root / "data/raw/resources/mcu-build-stage1-final.json"
    build_detail = "final firmware build report missing"
    build_ok = False
    if build_path.is_file():
        try:
            build = _read_json(build_path)
            sections = build["builder_result"]["executable_sections_size"]
            sizes = {section["name"]: section for section in sections}
            text_size = int(sizes["text"]["size"])
            text_max = int(sizes["text"]["max_size"])
            data_size = int(sizes["data"]["size"])
            data_max = int(sizes["data"]["max_size"])
            build_ok = (
                text_size == 103_892
                and text_max == 786_432
                and data_size == 41_508
                and data_max == 262_144
            )
            build_detail = (
                f"flash {text_size}/{text_max}; global data {data_size}/{data_max} bytes"
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            build_detail = "final firmware build report is invalid"
    record("final MCU build", build_ok, build_detail)

    findings_path = root / "docs/stage-1-findings.md"
    findings = findings_path.read_text(encoding="utf-8") if findings_path.is_file() else ""
    findings_markers = (
        "Stage 1 status: complete with documented platform limitations",
        "## Recommendations for later contract stages",
        "## Accepted limitations and deferred work",
        "136,800 measurements with zero failed samples",
    )
    findings_ok = all(marker in findings for marker in findings_markers)
    record(
        "findings and limitations",
        findings_ok,
        "completion, recommendations, and limitations documented"
        if findings_ok
        else "Stage 1 findings are incomplete",
    )

    guide_path = root / "docs/stage-1.md"
    guide = guide_path.read_text(encoding="utf-8") if guide_path.is_file() else ""
    reproduction_scripts = (
        "run-stage1-campaign.sh",
        "run-stage1-loaded-campaign.sh",
        "run-stage1-governor-campaign.sh",
        "run-stage1-concurrency-campaign.sh",
        "run-stage1-loaded-concurrency-campaign.sh",
        "run-stage1-led-profile-campaign.sh",
        "run-stage1-clock-alignment-campaign.sh",
    )
    guide_ok = all(
        script in guide and (root / "scripts" / script).is_file()
        for script in reproduction_scripts
    )
    record(
        "reproduction commands",
        guide_ok,
        f"{len(reproduction_scripts)} campaign runners documented"
        if guide_ok
        else "one or more campaign runners are missing or undocumented",
    )

    passed = all(bool(check["passed"]) for check in checks)
    return {
        "schema_version": 1,
        "generated_utc": datetime.now(UTC).isoformat(),
        "stage": 1,
        "status": "pass" if passed else "fail",
        "measurement_total": measured_total,
        "failure_total": failed_total,
        "checks": checks,
    }


def write_audit(result: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
