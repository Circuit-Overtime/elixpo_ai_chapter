from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from .recommendation import recommend

SCENARIO_SCHEMA_VERSION = 1


def _candidate(record: dict[str, Any], domain: str) -> dict[str, Any]:
    return next(candidate for candidate in record["candidates"] if candidate["domain"] == domain)


def _reason_codes(record: dict[str, Any], domain: str) -> list[str]:
    return [reason["code"] for reason in _candidate(record, domain)["rejection_reasons"]]


def run_recommendation_scenarios(base: dict[str, Any]) -> dict[str, Any]:
    if len(base.get("tasks", [])) != 1:
        raise ValueError("Stage 6 scenario suite requires exactly one base task")
    task = base["tasks"][0]
    linux_p95 = task["candidates"]["linux"]["end_to_end_p95_ns"]
    faster_rt_p95 = max(1, int(linux_p95 * 0.5))

    definitions: list[tuple[str, dict[str, Any], str | None, str | None]] = []

    def scenario(name: str) -> dict[str, Any]:
        value = copy.deepcopy(base)
        definitions.append((name, value, None, None))
        return value

    baseline = scenario("measured-end-to-end")
    definitions[-1] = (
        "measured-end-to-end",
        baseline,
        "linux",
        "higher_predicted_end_to_end",
    )

    faster_rt = scenario("rt-positive")
    faster_rt["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    definitions[-1] = ("rt-positive", faster_rt, "rt", None)

    insufficient = scenario("insufficient-evidence")
    insufficient["tasks"][0]["candidates"]["rt"]["evidence_count"] = (
        insufficient["policy"]["minimum_evidence"] - 1
    )
    definitions[-1] = (
        "insufficient-evidence",
        insufficient,
        None,
        "insufficient_evidence",
    )

    inadmissible = scenario("rt-inadmissible")
    inadmissible["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    inadmissible["tasks"][0]["candidates"]["rt"]["admission_allowed"] = False
    definitions[-1] = (
        "rt-inadmissible",
        inadmissible,
        "linux",
        "destination_not_admitted",
    )

    effect = scenario("effect-ineligible")
    effect["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    effect["tasks"][0]["effect"] = "Q_STATEFUL"
    effect["tasks"][0]["transition_hooks_declared"] = False
    definitions[-1] = (
        "effect-ineligible",
        effect,
        "linux",
        "semantic_ineligible",
    )

    chain = scenario("chain-ping-pong")
    chain_task = chain["tasks"][0]
    chain_deadline = chain_task["contract"]["deadline_ns"]
    chain_task["candidates"]["linux"]["end_to_end_p95_ns"] = int(
        chain_deadline * 0.45
    )
    chain_task["candidates"]["rt"]["end_to_end_p95_ns"] = int(chain_deadline * 0.40)
    boundary_cost = int(chain_deadline * 0.05)
    chain_task["chain_edges"] = [
        {
            "neighbor": "decode",
            "neighbor_domain": "linux",
            "boundary_cost_ns": boundary_cost,
        },
        {
            "neighbor": "encode",
            "neighbor_domain": "linux",
            "boundary_cost_ns": boundary_cost,
        },
    ]
    definitions[-1] = (
        "chain-ping-pong",
        chain,
        "linux",
        "higher_predicted_end_to_end",
    )

    cooldown = scenario("cooldown")
    cooldown["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    cooldown["policy"]["cooldown_active"] = True
    definitions[-1] = ("cooldown", cooldown, "linux", "cooldown_active")

    headroom = scenario("mcu-headroom")
    headroom["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    headroom["mcu"]["utilization_without_task_pct"] = 74.99
    headroom["tasks"][0]["rate_hz"] = 1_000_000_000
    definitions[-1] = (
        "mcu-headroom",
        headroom,
        "linux",
        "mcu_headroom_exceeded",
    )

    contract = scenario("contract-at-risk")
    contract["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    contract["tasks"][0]["candidates"]["rt"]["contract_state"] = "AT_RISK"
    definitions[-1] = (
        "contract-at-risk",
        contract,
        "linux",
        "contract_not_satisfied",
    )

    miss_rate = scenario("observed-miss-rate")
    miss_rate["tasks"][0]["candidates"]["rt"]["end_to_end_p95_ns"] = faster_rt_p95
    miss_rate["tasks"][0]["candidates"]["rt"]["observed_miss_rate_pct"] = (
        miss_rate["tasks"][0]["contract"]["max_miss_rate_pct"] + 0.1
    )
    definitions[-1] = (
        "observed-miss-rate",
        miss_rate,
        "linux",
        "observed_miss_rate_exceeds_contract",
    )

    deadline = scenario("predicted-deadline-miss")
    deadline_task = deadline["tasks"][0]
    deadline_task["candidates"]["rt"]["end_to_end_p95_ns"] = (
        deadline_task["contract"]["deadline_ns"] + 1
    )
    definitions[-1] = (
        "predicted-deadline-miss",
        deadline,
        "linux",
        "predicted_deadline_miss",
    )

    results = []
    for name, source, expected_domain, required_rt_reason in definitions:
        first = recommend(source)
        second = recommend(copy.deepcopy(source))
        record = first["records"][0]
        reasons = _reason_codes(record, "rt")
        checks = {
            "expected_domain": record["recommended_domain"] == expected_domain,
            "required_rt_reason": (
                required_rt_reason is None or required_rt_reason in reasons
            ),
            "deterministic": first == second,
            "advisory_only": (
                first["advisory_only"] is True
                and first["placement_changes"] == 0
                and record["placement_changed"] is False
            ),
        }
        results.append(
            {
                "name": name,
                "expected_domain": expected_domain,
                "required_rt_reason": required_rt_reason,
                "checks": checks,
                "passed": all(checks.values()),
                "input": source,
                "recommendation": first,
            }
        )
    failures = [result["name"] for result in results if not result["passed"]]
    return {
        "schema_version": SCENARIO_SCHEMA_VERSION,
        "status": "pass" if not failures else "fail",
        "scenario_count": len(results),
        "failures": failures,
        "scenarios": results,
    }


def write_scenario_suite(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
