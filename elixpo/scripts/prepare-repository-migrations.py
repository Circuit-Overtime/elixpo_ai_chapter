#!/usr/bin/env python3
"""Prepare reviewable Repository Standard 1.0 migrations.

Dry-run is the default. ``--write`` creates only missing policy documents and
replaces legacy manifests; it refuses dirty repositories and never writes a
license. Every resulting checkout must still pass the conformance checker and
receive maintainer review in its own pull request.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
TODAY = "2026-10-17"
REVIEW_AT = "2027-01-17"

PROFILES: dict[str, dict[str, Any]] = {
    "accounts.elixpo": {"local": "accounts.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["Next.js", "TypeScript", "Cloudflare"]},
    "admin.elixpo": {"local": "admin.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["Next.js", "TypeScript", "Cloudflare"]},
    "cypher": {"local": "cypher", "artifact": "application", "profile": "incubating-software", "technologies": ["Python", "Firebase", "web application"]},
    "elixpo_chapter": {"local": "elixpo_chapter", "artifact": "community", "profile": "chapter-collection", "technologies": ["Git", "GitHub Actions", "documentation"]},
    "Kareixo": {"local": "Kareixo", "artifact": "application", "profile": "member-project", "technologies": ["software", "web application"], "maintainer": "karanray06"},
    "lixrl.com": {"local": "lixrl.com", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["Next.js", "TypeScript", "Cloudflare"]},
    "mails.elixpo": {"local": "mail.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["TypeScript", "email infrastructure", "Cloudflare"]},
    "me.elixpo": {"local": "me.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["Next.js", "TypeScript", "Cloudflare"]},
    "monodiffuse": {"local": "monodiffuse", "artifact": "experiment", "profile": "open-research", "technologies": ["Python", "PyTorch", "diffusion models"]},
    "octabit": {"local": "octabit", "artifact": "hardware", "profile": "research-hardware", "technologies": ["digital logic", "computer architecture", "8-bit CPU"]},
    "Nano28C64": {"local": "Nano28C64", "artifact": "hardware", "profile": "open-hardware", "technologies": ["EEPROM", "digital logic", "circuit design"]},
    "opensource.elixpo": {"local": "opensource.elixpo", "artifact": "hosted-service", "profile": "incubating-service", "technologies": ["TypeScript", "web application", "GitHub"]},
    "oreo": {"local": "oreoOS", "artifact": "hardware", "profile": "research-hardware", "technologies": ["OreoOS", "embedded systems", "open hardware"]},
    "payouts.elixpo": {"local": "payouts.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["TypeScript", "payments", "Cloudflare"]},
    "qfabric": {"local": "qfabric", "artifact": "framework", "profile": "open-research", "technologies": ["Python", "quantum computing", "simulation"]},
    "sketch.elixpo": {"local": "sketch.elixpo", "artifact": "application", "profile": "software-monorepo", "technologies": ["Next.js", "TypeScript", "SVG", "Cloudflare"]},
    "status.elixpo": {"local": "status.elixpo", "artifact": "hosted-service", "profile": "hosted-service", "technologies": ["Next.js", "TypeScript", "Cloudflare"]},
    "wozformer": {"local": "wozformer", "artifact": "model", "profile": "open-research", "technologies": ["Python", "machine learning", "language models"]},
}


def git_clean(repository: Path) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repository), "status", "--porcelain"],
        check=True,
        capture_output=True,
        text=True,
    )
    return not result.stdout.strip()


def commands(repository: Path, profile: dict[str, Any]) -> dict[str, str]:
    package = repository / "package.json"
    scripts: dict[str, Any] = {}
    if package.is_file():
        scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts", {})
    return {
        "lint_cmd": "npm run lint" if "lint" in scripts else "",
        "test_cmd": "npm test" if "test" in scripts else "",
        "build_cmd": "npm run build" if "build" in scripts else "",
    }


def canonical_url(family: str, slug: str, name: str) -> str:
    if name == "elixpo_chapter":
        return "https://elixpo.com/chapter"
    segment = {"project": "projects", "research": "research", "service": "services"}[family]
    return f"https://elixpo.com/{segment}/{slug}"


def manifest(
    repository: Path,
    central: dict[str, Any],
    detail: dict[str, Any],
    license_record: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    name = central["name"]
    slug = detail["slug"]
    family = central["publicClass"]
    license_exists = (repository / "LICENSE").is_file()
    maintainer = profile.get("maintainer", "Circuit-Overtime")
    exceptions: list[dict[str, str]] = []
    if not license_exists:
        exceptions.append({
            "id": "license-missing",
            "reason": "No repository license is currently published; reuse permission must not be inferred until maintainer review is complete.",
            "owner": maintainer,
            "review_at": REVIEW_AT,
        })
    notice = "LICENSES/NOTICE" if (repository / "LICENSES" / "NOTICE").is_file() else None
    return {
        "schema_version": "1.0",
        "project": {
            "id": slug,
            "name": name,
            "title": detail["name"],
            "description": detail["summary"],
            "family": family,
            "artifact_type": profile["artifact"],
            "profile": profile["profile"],
            "technologies": profile["technologies"],
            "chapter_status": None,
            "lifecycle": central["lifecycle"],
            "relationship": central["relationship"],
            "custody": central["custody"],
            "stack": profile["profile"],
            "repository": central["repositoryUrl"],
            "deployment": detail.get("website"),
            "discussions": "https://github.com/orgs/elixpo/discussions",
            "status_owner": central["statusOwner"],
            "status_verified_at": central["statusVerifiedAt"],
        },
        "publication": {
            "public": True,
            "featured": detail.get("featured", False),
            "canonical_slug": slug,
            "canonical_url": canonical_url(family, slug, name),
        },
        "provenance": {
            "classification_decision": "https://github.com/elixpo/elixpo/blob/main/docs/governance/repository-classification-decisions.md",
            "license_evidence": "https://github.com/elixpo/elixpo/blob/main/content/repository-licenses.json",
            "status_checked_at": TODAY,
        },
        "license": {
            "current_file": "LICENSE" if license_exists else None,
            "notice_file": notice,
            "migration_status": "review-required" if license_record["classification"] in {"custom-mixed", "missing"} else "current",
            "target_code_license": license_record.get("spdxId") or "not-designated",
            "trademark_policy": "https://elixpo.com/terms",
        },
        "ci": commands(repository, profile),
        "maintainers": [{
            "github": maintainer,
            "skills": list(profile["technologies"]),
            "lead": True,
        }],
        "governance": {
            "model": "member-maintainer-led" if name == "Kareixo" else "maintainer-led",
            "document": "GOVERNANCE.md",
        },
        "support": {"document": "SUPPORT.md"},
        "security": {"document": "SECURITY.md"},
        "conformance": {
            "standard": "1.0",
            "status": "conformant-with-exceptions" if exceptions else "conformant",
            "assessed_at": TODAY,
            "exceptions": exceptions,
        },
    }


def documents(title: str, repository_url: str, maintainer: str, member: bool) -> dict[str, str]:
    issue_url = f"{repository_url}/issues"
    advisory_url = f"{repository_url}/security/advisories/new"
    authority = (
        f"The original project maintainer, @{maintainer}, retains project authority and release control. "
        "Elixpo provides stewardship infrastructure without converting the project into centrally authored software."
        if member else
        f"The lead maintainer is @{maintainer}. Material scope, release, governance, and lifecycle changes require maintainer review."
    )
    return {
        "CONTRIBUTING.md": f"# Contributing to {title}\n\nStart with an issue or an Elixpo Discussion before undertaking a large change. Keep pull requests focused, explain the user-visible result, and run the commands declared in `.elixpo/project.yml`. By participating, you agree to the repository's code of conduct.\n\n- Issues: {issue_url}\n- Discussions: https://github.com/orgs/elixpo/discussions\n",
        "CODE_OF_CONDUCT.md": "# Code of conduct\n\nThis repository follows the [Elixpo Community Code of Conduct](https://elixpo.com/code-of-conduct). Reports and enforcement follow the private route described there; do not disclose sensitive reports in a public issue.\n",
        "SECURITY.md": f"# Security policy\n\nDo not report vulnerabilities in a public issue. Use [GitHub's private security advisory form]({advisory_url}) with affected versions, reproduction steps, impact, and any suggested mitigation. No response-time or remediation guarantee is implied.\n",
        "SUPPORT.md": f"# Support\n\nUse [repository issues]({issue_url}) for reproducible project defects and [Elixpo Discussions](https://github.com/orgs/elixpo/discussions) for questions or proposals. Security reports must use the private route in `SECURITY.md`. Support is best-effort and does not create a service-level commitment.\n",
        "GOVERNANCE.md": f"# Governance\n\n{authority}\n\nContributors retain attribution for accepted work. Repository transfer, licensing, security disclosure, publication, and project-status decisions require explicit human approval. Canonical public status is recorded at [elixpo.com](https://elixpo.com).\n",
        "CHANGELOG.md": f"# {title} release history\n\nThe repository's Git history and GitHub Releases are the authoritative release record. Project-specific release notes should be added here when a release needs a curated migration or compatibility notice.\n",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write reviewable migration files")
    parser.add_argument("--repositories", nargs="*", choices=sorted(PROFILES), help="limit the migration set")
    args = parser.parse_args()

    repositories = json.loads((ROOT / "content" / "repositories.json").read_text())["entries"]
    directory = json.loads((ROOT / "content" / "directory.json").read_text())["entries"]
    licenses = json.loads((ROOT / "content" / "repository-licenses.json").read_text())["entries"]
    central_by_name = {item["name"]: item for item in repositories}
    selected = args.repositories or list(PROFILES)
    pending: list[tuple[Path, str, str]] = []

    for name in selected:
        profile = PROFILES[name]
        repository = WORKSPACE / profile["local"]
        if not (repository / ".git").is_dir():
            raise SystemExit(f"Missing checkout: {repository}")
        if not git_clean(repository):
            print(f"SKIP dirty repository: {repository}")
            continue
        record = manifest(repository, central_by_name[name], directory[name], licenses[name], profile)
        manifest_path = repository / ".elixpo" / "project.yml"
        existing_manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        if not isinstance(existing_manifest, dict) or str(existing_manifest.get("schema_version")) != "1.0":
            pending.append((manifest_path, yaml.safe_dump(record, sort_keys=False, allow_unicode=True), "manifest"))
        for filename, body in documents(directory[name]["name"], central_by_name[name]["repositoryUrl"], profile.get("maintainer", "Circuit-Overtime"), name == "Kareixo").items():
            path = repository / filename
            if not path.exists():
                pending.append((path, body, "policy"))

    verb = "WRITE" if args.write else "PLAN"
    for path, body, kind in pending:
        print(f"{verb} {kind}: {path}")
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
    print(f"{len(pending)} migration file(s); write={args.write}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
