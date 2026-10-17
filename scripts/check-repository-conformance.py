#!/usr/bin/env python3
"""Audit one repository against the Elixpo Repository Standard."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import yaml
except ImportError:  # pragma: no cover - operator environment failure
    print("ERROR DEPENDENCY: PyYAML is required to read .elixpo/project.yml.", file=sys.stderr)
    print("REMEDIATION: install PyYAML in the audit environment; do not add it to the audited project.", file=sys.stderr)
    raise SystemExit(2)


STANDARD_VERSION = "1.0"
SUPPORTED_VERSIONS = {"0.1", STANDARD_VERSION}
ACTIVE_LIFECYCLES = {"incubating", "active", "maintenance", "paused", "completed"}
FAMILIES = {"project", "research", "service"}
LIFECYCLES = ACTIVE_LIFECYCLES | {"archived"}
RELATIONSHIPS = {"core", "chapter", "member", "connected"}
CUSTODY = {"elixpo-owned", "transferred-to-elixpo", "externally-owned", "mirrored"}
ARTIFACT_TYPES = {
    "application", "library", "cli", "package", "framework", "hardware", "paper",
    "experiment", "dataset", "model", "hosted-service", "api", "infrastructure",
    "website", "community", "brand-resource", "organization-meta",
}
REQUIRED_FILES = {
    "README.md": "add a project-focused README",
    "CONTRIBUTING.md": "document contribution and local-check paths",
    "CODE_OF_CONDUCT.md": "publish participation and enforcement expectations",
    "SECURITY.md": "publish a private vulnerability-reporting route",
    "SUPPORT.md": "publish support routes and boundaries",
    "LICENSE": "publish the repository's current legal terms",
}


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    location: str
    message: str
    remediation: str


class Audit:
    def __init__(self) -> None:
        self.findings: list[Finding] = []

    def add(self, severity: str, code: str, location: str, message: str, remediation: str) -> None:
        self.findings.append(Finding(severity, code, location, message, remediation))

    def error(self, code: str, location: str, message: str, remediation: str) -> None:
        self.add("ERROR", code, location, message, remediation)

    def warn(self, code: str, location: str, message: str, remediation: str) -> None:
        self.add("WARN", code, location, message, remediation)


def nested(record: dict[str, Any], *path: str) -> Any:
    current: Any = record
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def is_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))


def require_value(audit: Audit, manifest: dict[str, Any], path: tuple[str, ...]) -> Any:
    value = nested(manifest, *path)
    location = ".".join(path)
    if value is None or value == "":
        audit.error("MANIFEST_REQUIRED", location, "Required manifest value is missing.", f"Add `{location}` to .elixpo/project.yml.")
    return value


def reviewed_exception(manifest: dict[str, Any], exception_id: str) -> bool:
    conformance = manifest.get("conformance")
    if not isinstance(conformance, dict) or conformance.get("status") not in {"conformant-with-exceptions", "migration-in-progress"}:
        return False
    exceptions = conformance.get("exceptions")
    if not isinstance(exceptions, list):
        return False
    return any(
        isinstance(item, dict)
        and item.get("id") == exception_id
        and isinstance(item.get("reason"), str)
        and bool(item["reason"].strip())
        and isinstance(item.get("owner"), str)
        and bool(item["owner"].strip())
        and is_iso_date(item.get("review_at"))
        for item in exceptions
    )


def validate_manifest(audit: Audit, manifest: dict[str, Any], repo: Path) -> None:
    manifest_version = manifest.get("schema_version")
    if manifest_version not in SUPPORTED_VERSIONS:
        audit.error("SCHEMA_VERSION", "schema_version", f"Unsupported version {manifest_version!r}.", f"Use repository standard {STANDARD_VERSION} or a supported migration version.")
    elif manifest_version != STANDARD_VERSION:
        audit.warn("SCHEMA_VERSION", "schema_version", f"Version {manifest_version!r} remains readable for migration but is not current.", f"Migrate the manifest to repository standard {STANDARD_VERSION} before claiming current conformance.")

    for section in ["project", "publication", "license", "ci", "maintainers", "governance", "support", "security"]:
        require_value(audit, manifest, (section,))

    project_fields = ["id", "name", "title", "description", "family", "artifact_type", "lifecycle", "relationship", "custody", "repository", "status_owner", "status_verified_at"]
    for field in project_fields:
        require_value(audit, manifest, ("project", field))

    if manifest_version == STANDARD_VERSION:
        for field in ["profile", "technologies", "chapter_status"]:
            if field not in (manifest.get("project") or {}):
                audit.error("PROJECT_PROFILE", f"project.{field}", "Repository Standard 1.0 requires this profile field.", f"Add `project.{field}` using the applicable repository profile.")
        if "canonical_url" not in (manifest.get("publication") or {}):
            audit.error("CANONICAL_URL", "publication.canonical_url", "Repository Standard 1.0 requires the canonical public record URL.", "Add the canonical elixpo.com dossier URL.")
        for field in ["classification_decision", "license_evidence", "status_checked_at"]:
            require_value(audit, manifest, ("provenance", field))

    project_id = nested(manifest, "project", "id")
    if isinstance(project_id, str) and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", project_id):
        audit.error("PROJECT_ID", "project.id", "The stable ID is not a lowercase URL-safe slug.", "Use lowercase letters, numbers, and single hyphens.")
    description = nested(manifest, "project", "description")
    if isinstance(description, str) and not 20 <= len(description) <= 240:
        audit.error("DESCRIPTION_LENGTH", "project.description", "Description must contain 20–240 characters.", "Replace it with one factual sentence suitable for the public directory.")

    enum_checks = [
        (("project", "family"), FAMILIES),
        (("project", "artifact_type"), ARTIFACT_TYPES),
        (("project", "lifecycle"), LIFECYCLES),
        (("project", "relationship"), RELATIONSHIPS),
        (("project", "custody"), CUSTODY),
    ]
    for path, choices in enum_checks:
        value = nested(manifest, *path)
        if value is not None and value not in choices:
            audit.error("CONTROLLED_VALUE", ".".join(path), f"Unknown value {value!r}.", f"Choose one of: {', '.join(sorted(choices))}.")

    repository = nested(manifest, "project", "repository")
    if repository is not None and (not is_url(repository) or not repository.startswith("https://github.com/")):
        audit.error("REPOSITORY_URL", "project.repository", "Repository must be a canonical HTTPS GitHub URL.", "Use https://github.com/<owner>/<repository>.")
    for field in ["deployment", "discussions"]:
        value = nested(manifest, "project", field)
        if value is not None and not is_url(value):
            audit.error("URL", f"project.{field}", f"Invalid URL {value!r}.", "Use an absolute HTTPS URL or null.")
    if not is_iso_date(nested(manifest, "project", "status_verified_at")):
        audit.error("STATUS_DATE", "project.status_verified_at", "Status verification date must use YYYY-MM-DD.", "Verify the status and record the UTC calendar date.")

    publication = manifest.get("publication") if isinstance(manifest.get("publication"), dict) else {}
    for field in ["public", "featured", "canonical_slug"]:
        if field not in publication:
            audit.error("PUBLICATION_REQUIRED", f"publication.{field}", "Publication field is missing.", f"Add `publication.{field}` to the manifest.")
    for field in ["public", "featured"]:
        if field in publication and not isinstance(publication[field], bool):
            audit.error("BOOLEAN", f"publication.{field}", "Expected a boolean.", "Use true or false without quotes.")
    slug = publication.get("canonical_slug")
    if isinstance(slug, str) and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        audit.error("PUBLIC_SLUG", "publication.canonical_slug", "Canonical slug is not URL-safe.", "Use lowercase letters, numbers, and single hyphens.")

    maintainers = manifest.get("maintainers")
    if not isinstance(maintainers, list) or not maintainers:
        audit.error("MAINTAINER", "maintainers", "At least one accountable maintainer is required.", "Add a verified GitHub handle and identify at least one lead.")
    else:
        seen: set[str] = set()
        for index, maintainer in enumerate(maintainers):
            location = f"maintainers[{index}]"
            handle = maintainer.get("github") if isinstance(maintainer, dict) else None
            if not isinstance(handle, str) or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", handle):
                audit.error("MAINTAINER_HANDLE", f"{location}.github", "Invalid GitHub handle.", "Record the maintainer's public GitHub handle without @.")
            elif handle.lower() in seen:
                audit.error("MAINTAINER_DUPLICATE", f"{location}.github", "Maintainer is listed more than once.", "Keep one record per GitHub handle.")
            else:
                seen.add(handle.lower())
        if not any(isinstance(item, dict) and item.get("lead") is True for item in maintainers):
            audit.error("MAINTAINER_LEAD", "maintainers", "No lead maintainer is declared.", "Mark at least one accountable maintainer with `lead: true`.")

    lifecycle = nested(manifest, "project", "lifecycle")
    if lifecycle in ACTIVE_LIFECYCLES:
        for filename, remediation in REQUIRED_FILES.items():
            if not (repo / filename).is_file():
                if filename == "LICENSE" and reviewed_exception(manifest, "license-missing"):
                    audit.warn("LICENSE_EXCEPTION", filename, "No license is published; reuse permission must not be inferred.", "Resolve the recorded legal review before claiming full conformance.")
                else:
                    audit.error("REQUIRED_FILE", filename, "Required repository document is missing.", remediation.capitalize() + ".")

    license_file = nested(manifest, "license", "current_file")
    if isinstance(license_file, str) and not (repo / license_file).is_file():
        audit.error("POLICY_POINTER", "license.current_file", f"Declared file {license_file!r} does not exist.", "Correct the pointer or add the current license file.")
    notice_file = nested(manifest, "license", "notice_file")
    if isinstance(notice_file, str) and notice_file and not (repo / notice_file).is_file():
        audit.error("POLICY_POINTER", "license.notice_file", f"Declared file {notice_file!r} does not exist.", "Correct the pointer or add the notice file.")
    for section in ["governance", "support", "security"]:
        document = nested(manifest, section, "document")
        if not isinstance(document, str) or not document:
            audit.error("POLICY_POINTER", f"{section}.document", "A policy document path is required.", f"Point `{section}.document` to a repository file.")
        elif not (repo / document).is_file():
            audit.error("POLICY_POINTER", f"{section}.document", f"Declared file {document!r} does not exist.", "Correct the pointer or add the document.")

    operations = manifest.get("operations") if isinstance(manifest.get("operations"), dict) else {}
    privileged = operations.get("privileged_workflows_repo_specific") is True
    governance_required = nested(manifest, "project", "relationship") == "member" or nested(manifest, "project", "custody") == "transferred-to-elixpo" or (isinstance(maintainers, list) and len(maintainers) > 1) or privileged
    if governance_required and not (repo / "GOVERNANCE.md").is_file():
        audit.error("GOVERNANCE_REQUIRED", "GOVERNANCE.md", "This repository profile requires explicit governance.", "Add GOVERNANCE.md and point `governance.document` to it.")
    for key, value in operations.items():
        if key.endswith("_workflow") and isinstance(value, str) and not (repo / value).is_file():
            audit.error("WORKFLOW_POINTER", f"operations.{key}", f"Declared workflow {value!r} does not exist.", "Correct the workflow path or remove the stale operation record.")

    conformance = manifest.get("conformance")
    if not isinstance(conformance, dict):
        audit.warn("CONFORMANCE_UNDECLARED", "conformance", "The repository has not declared its assessment state.", "Add a conformance block with standard, status, assessed_at, and reviewed exceptions.")
    else:
        if conformance.get("standard") != STANDARD_VERSION:
            audit.error("CONFORMANCE_VERSION", "conformance.standard", "Conformance version does not match the manifest schema.", f"Set it to {STANDARD_VERSION!r} after reassessment.")
        if conformance.get("status") not in {"conformant", "conformant-with-exceptions", "migration-in-progress", "not-assessed"}:
            audit.error("CONFORMANCE_STATUS", "conformance.status", "Unknown conformance state.", f"Use a state defined by standard {STANDARD_VERSION}.")
        if not is_iso_date(conformance.get("assessed_at")):
            audit.error("CONFORMANCE_DATE", "conformance.assessed_at", "Assessment date must use YYYY-MM-DD.", "Record the date of the latest conformance review.")
        exceptions = conformance.get("exceptions", [])
        if conformance.get("status") == "conformant-with-exceptions" and not exceptions:
            audit.error("EXCEPTIONS_REQUIRED", "conformance.exceptions", "The status claims exceptions but none are recorded.", "Record every exception with an owner, reason, and review date.")
        if isinstance(exceptions, list):
            for index, exception in enumerate(exceptions):
                location = f"conformance.exceptions[{index}]"
                if not isinstance(exception, dict):
                    audit.error("EXCEPTION_FORMAT", location, "Exception must be a mapping.", "Record id, reason, owner, and review_at.")
                    continue
                for field in ["id", "reason", "owner"]:
                    if not isinstance(exception.get(field), str) or not exception[field].strip():
                        audit.error("EXCEPTION_FORMAT", f"{location}.{field}", "Required exception field is missing.", f"Add `{field}` to the reviewed exception.")
                if not is_iso_date(exception.get("review_at")):
                    audit.error("EXCEPTION_DATE", f"{location}.review_at", "Exception review date must use YYYY-MM-DD.", "Record a future review date.")


def validate_registry_alignment(audit: Audit, manifest: dict[str, Any], registry_root: Path) -> None:
    try:
        repositories = json.loads((registry_root / "content/repositories.json").read_text())
        directory = json.loads((registry_root / "content/directory.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        audit.error("REGISTRY_READ", "content", f"Cannot read the canonical registry: {error}.", "Pass --registry-root pointing to a checkout of elixpo/elixpo.")
        return

    name = nested(manifest, "project", "name")
    matches = [item for item in repositories.get("entries", []) if item.get("name") == name]
    if not matches:
        audit.error("REGISTRY_MISSING", "project.name", f"No canonical repository record exists for {name!r}.", "Add or correct the central registry record before publishing the manifest.")
        return
    central = matches[0]
    comparisons = {
        "project.lifecycle": (nested(manifest, "project", "lifecycle"), central.get("lifecycle")),
        "project.relationship": (nested(manifest, "project", "relationship"), central.get("relationship")),
        "project.custody": (nested(manifest, "project", "custody"), central.get("custody")),
        "project.repository": (nested(manifest, "project", "repository"), central.get("repositoryUrl")),
    }
    if central.get("disposition") == "public-entry":
        comparisons["project.family"] = (nested(manifest, "project", "family"), central.get("publicClass"))
    for location, (local_value, central_value) in comparisons.items():
        if local_value != central_value:
            audit.error("REGISTRY_DRIFT", location, f"Manifest value {local_value!r} differs from canonical value {central_value!r}.", "Resolve the factual difference with the maintainer; do not silently choose either source.")
    detail = directory.get("entries", {}).get(name)
    if detail and nested(manifest, "publication", "canonical_slug") != detail.get("slug"):
        audit.error("REGISTRY_DRIFT", "publication.canonical_slug", f"Manifest slug differs from canonical slug {detail.get('slug')!r}.", "Use the canonical directory slug or update the registry through review.")


def main() -> int:
    parser = argparse.ArgumentParser(description=f"Audit a repository against the Elixpo Repository Standard {STANDARD_VERSION}.")
    parser.add_argument("repository", nargs="?", default=".", help="repository checkout to audit")
    parser.add_argument("--registry-root", default=str(Path(__file__).resolve().parents[1]), help="elixpo/elixpo checkout containing content/")
    parser.add_argument("--strict", action="store_true", help="treat warnings as a failing result")
    args = parser.parse_args()

    repo = Path(args.repository).expanduser().resolve()
    registry_root = Path(args.registry_root).expanduser().resolve()
    manifest_path = repo / ".elixpo/project.yml"
    if not manifest_path.is_file():
        print(f"ERROR MANIFEST_MISSING: {manifest_path} does not exist.")
        print("REMEDIATION: add a reviewed .elixpo/project.yml using docs/repository-standard/project-manifest.example.yml.")
        return 1
    try:
        manifest = yaml.safe_load(manifest_path.read_text())
    except (OSError, yaml.YAMLError) as error:
        print(f"ERROR MANIFEST_PARSE: {error}")
        print("REMEDIATION: correct the YAML syntax before running the conformance audit.")
        return 1
    if not isinstance(manifest, dict):
        print("ERROR MANIFEST_TYPE: the manifest root must be a mapping.")
        return 1

    audit = Audit()
    validate_manifest(audit, manifest, repo)
    validate_registry_alignment(audit, manifest, registry_root)
    errors = [item for item in audit.findings if item.severity == "ERROR"]
    warnings = [item for item in audit.findings if item.severity == "WARN"]

    print(f"Elixpo repository conformance audit: {repo}")
    print(f"Standard: {STANDARD_VERSION} · errors: {len(errors)} · warnings: {len(warnings)}")
    for finding in audit.findings:
        print(f"\n{finding.severity} {finding.code} [{finding.location}]")
        print(f"  {finding.message}")
        print(f"  Remediation: {finding.remediation}")
    if not audit.findings:
        print("PASS: no conformance findings.")
    elif not errors:
        print(f"\nPASS WITH WARNINGS: applicable {manifest.get('schema_version')} checks passed.")

    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
