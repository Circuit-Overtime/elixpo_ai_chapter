#!/usr/bin/env python3
"""Crawl Elixpo public surfaces and audit crawl, SEO, a11y, and delivery basics."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


SURFACES = (
    "https://elixpo.com",
    "https://research.elixpo.com",
    "https://packages.elixpo.com",
)
USER_AGENT = "ElixpoPublicSurfaceAudit/1.0 (+https://elixpo.com)"
TIMEOUT_SECONDS = 20
MAX_URLS_PER_SURFACE = 300


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    url: str
    message: str


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang: str | None = None
        self.title_parts: list[str] = []
        self.in_title = False
        self.meta: dict[str, str] = {}
        self.canonical: str | None = None
        self.h1_count = 0
        self.main_count = 0
        self.images = 0
        self.images_without_alt = 0
        self.text_parts: list[str] = []
        self.json_ld: list[str] = []
        self._json_ld_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag == "html":
            self.lang = values.get("lang") or None
        elif tag == "title":
            self.in_title = True
        elif tag == "meta":
            key = (values.get("name") or values.get("property") or "").lower()
            if key:
                self.meta[key] = values.get("content", "").strip()
        elif tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonical = values.get("href") or None
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "main":
            self.main_count += 1
        elif tag == "img":
            self.images += 1
            if "alt" not in values:
                self.images_without_alt += 1
        elif tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._json_ld_parts = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        elif tag == "script" and self._json_ld_parts is not None:
            self.json_ld.append("".join(self._json_ld_parts).strip())
            self._json_ld_parts = None

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self._json_ld_parts is not None:
            self._json_ld_parts.append(data)
        normalized = " ".join(data.split())
        if normalized:
            self.text_parts.append(normalized)

    @property
    def title(self) -> str:
        return " ".join("".join(self.title_parts).split())

    @property
    def word_count(self) -> int:
        return len(" ".join(self.text_parts).split())


def normalized_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, parsed.query, ""))


def fetch(url: str) -> tuple[str, int, dict[str, str], bytes, float]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xml,text/plain;q=0.9,*/*;q=0.1"})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        body = response.read()
        elapsed = time.monotonic() - started
        headers = {key.lower(): value for key, value in response.headers.items()}
        return response.geturl(), response.status, headers, body, elapsed


def sitemap_urls(root: str, findings: list[Finding]) -> list[str]:
    robots_url = f"{root}/robots.txt"
    sitemap_url = f"{root}/sitemap.xml"
    try:
        final_url, status, _, body, _ = fetch(robots_url)
        text = body.decode("utf-8", "replace")
        if status != 200:
            findings.append(Finding("error", "ROBOTS_STATUS", robots_url, f"Returned HTTP {status}."))
        if "user-agent:" not in text.lower():
            findings.append(Finding("error", "ROBOTS_USER_AGENT", robots_url, "No User-agent directive was found."))
        declared = [line.split(":", 1)[1].strip() for line in text.splitlines() if line.lower().startswith("sitemap:")]
        if sitemap_url not in declared:
            findings.append(Finding("error", "ROBOTS_SITEMAP", final_url, f"Expected Sitemap: {sitemap_url}."))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        findings.append(Finding("error", "ROBOTS_FETCH", robots_url, str(error)))

    try:
        final_url, status, headers, body, _ = fetch(sitemap_url)
        if status != 200:
            findings.append(Finding("error", "SITEMAP_STATUS", sitemap_url, f"Returned HTTP {status}."))
            return []
        if "xml" not in headers.get("content-type", ""):
            findings.append(Finding("warning", "SITEMAP_CONTENT_TYPE", final_url, f"Unexpected Content-Type: {headers.get('content-type', 'missing')}."))
        document = ET.fromstring(body)
    except (urllib.error.URLError, TimeoutError, ValueError, ET.ParseError) as error:
        findings.append(Finding("error", "SITEMAP_FETCH", sitemap_url, str(error)))
        return []

    urls = [element.text.strip() for element in document.iter() if element.tag.rsplit("}", 1)[-1] == "loc" and element.text]
    duplicates = [url for url, count in Counter(urls).items() if count > 1]
    for url in duplicates:
        findings.append(Finding("error", "SITEMAP_DUPLICATE", sitemap_url, f"Duplicate URL: {url}."))
    expected_host = urllib.parse.urlsplit(root).netloc
    accepted: list[str] = []
    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != expected_host:
            findings.append(Finding("error", "SITEMAP_NONCANONICAL_HOST", sitemap_url, f"Unexpected sitemap URL: {url}."))
        elif parsed.query or parsed.fragment:
            findings.append(Finding("error", "SITEMAP_QUERY_OR_FRAGMENT", sitemap_url, f"Noncanonical sitemap URL: {url}."))
        else:
            accepted.append(url)
    if not accepted:
        findings.append(Finding("error", "SITEMAP_EMPTY", sitemap_url, "No canonical page URLs were found."))
    if len(accepted) > MAX_URLS_PER_SURFACE:
        findings.append(Finding("error", "SITEMAP_LIMIT", sitemap_url, f"Contains {len(accepted)} URLs; audit limit is {MAX_URLS_PER_SURFACE}."))
    return accepted[:MAX_URLS_PER_SURFACE]


def audit_page(url: str) -> tuple[dict[str, Any], list[Finding]]:
    findings: list[Finding] = []
    record: dict[str, Any] = {"url": url}
    try:
        final_url, status, headers, body, elapsed = fetch(url)
    except urllib.error.HTTPError as error:
        return record, [Finding("error", "PAGE_STATUS", url, f"Returned HTTP {error.code}.")]
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        return record, [Finding("error", "PAGE_FETCH", url, str(error))]

    record.update(status=status, finalUrl=final_url, seconds=round(elapsed, 3), bytes=len(body), contentType=headers.get("content-type", ""))
    if status != 200:
        findings.append(Finding("error", "PAGE_STATUS", url, f"Returned HTTP {status}."))
    if normalized_url(final_url) != normalized_url(url):
        findings.append(Finding("error", "SITEMAP_REDIRECT", url, f"Sitemap URL redirects to {final_url}."))
    if elapsed > 2.5:
        findings.append(Finding("warning", "RESPONSE_TIME", url, f"Document response took {elapsed:.2f}s; budget is 2.50s."))
    if len(body) > 1_500_000:
        findings.append(Finding("warning", "DOCUMENT_SIZE", url, f"HTML response is {len(body):,} bytes; budget is 1,500,000 bytes."))
    if "text/html" not in headers.get("content-type", ""):
        findings.append(Finding("error", "CONTENT_TYPE", url, f"Expected HTML, received {headers.get('content-type', 'missing')}."))
        return record, findings

    parser = PageParser()
    parser.feed(body.decode("utf-8", "replace"))
    description = parser.meta.get("description", "")
    record.update(title=parser.title, description=description, canonical=parser.canonical, words=parser.word_count, h1=parser.h1_count, images=parser.images)

    if not parser.lang:
        findings.append(Finding("error", "HTML_LANG", url, "The html element has no language."))
    if not parser.title:
        findings.append(Finding("error", "TITLE_MISSING", url, "Document title is missing."))
    elif not 15 <= len(parser.title) <= 70:
        findings.append(Finding("warning", "TITLE_LENGTH", url, f"Title length is {len(parser.title)}; target is 15–70 characters."))
    if not description:
        findings.append(Finding("error", "DESCRIPTION_MISSING", url, "Meta description is missing."))
    elif not 50 <= len(description) <= 180:
        findings.append(Finding("warning", "DESCRIPTION_LENGTH", url, f"Description length is {len(description)}; target is 50–180 characters."))
    if not parser.canonical:
        findings.append(Finding("error", "CANONICAL_MISSING", url, "Canonical link is missing."))
    elif normalized_url(parser.canonical) != normalized_url(final_url):
        findings.append(Finding("error", "CANONICAL_MISMATCH", url, f"Canonical resolves to {parser.canonical}."))
    if not parser.meta.get("viewport"):
        findings.append(Finding("error", "VIEWPORT_MISSING", url, "Viewport metadata is missing."))
    if parser.meta.get("robots", "").lower().find("noindex") >= 0:
        findings.append(Finding("error", "NOINDEX", url, "Canonical sitemap page declares noindex."))
    for field in ("og:title", "og:description", "og:image", "twitter:card"):
        if not parser.meta.get(field):
            findings.append(Finding("error", "SOCIAL_METADATA", url, f"Missing {field}."))
    if parser.h1_count != 1:
        findings.append(Finding("error", "H1_COUNT", url, f"Expected one h1, found {parser.h1_count}."))
    if parser.main_count != 1:
        findings.append(Finding("warning", "MAIN_COUNT", url, f"Expected one main landmark, found {parser.main_count}."))
    if parser.images_without_alt:
        findings.append(Finding("error", "IMAGE_ALT", url, f"{parser.images_without_alt} image(s) omit the alt attribute."))
    if parser.word_count < 80:
        findings.append(Finding("warning", "THIN_PAGE", url, f"Only {parser.word_count} rendered text words were found."))
    if not parser.json_ld:
        findings.append(Finding("warning", "JSON_LD_MISSING", url, "No JSON-LD block was found."))
    for index, source in enumerate(parser.json_ld):
        try:
            data = json.loads(source)
        except json.JSONDecodeError as error:
            findings.append(Finding("error", "JSON_LD_INVALID", url, f"Block {index + 1}: {error}."))
            continue
        if isinstance(data, dict) and "@context" not in data:
            findings.append(Finding("error", "JSON_LD_CONTEXT", url, f"Block {index + 1} has no @context."))

    return record, findings


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    summary = report["summary"]
    lines = [
        "# Elixpo public-surface audit",
        "",
        f"Generated: {report['generatedAt']}",
        "",
        f"Pages: **{summary['pages']}** · Errors: **{summary['errors']}** · Warnings: **{summary['warnings']}**",
        "",
        "| Severity | Code | URL | Finding |",
        "| --- | --- | --- | --- |",
    ]
    for finding in report["findings"]:
        message = finding["message"].replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {finding['severity']} | `{finding['code']}` | {finding['url']} | {message} |")
    if not report["findings"]:
        lines.append("| — | — | — | No findings. |")
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write the complete JSON report")
    parser.add_argument("--markdown", type=Path, help="write a human-readable finding table")
    parser.add_argument("--strict", action="store_true", help="fail on warnings as well as errors")
    args = parser.parse_args()

    findings: list[Finding] = []
    urls: list[str] = []
    for surface in SURFACES:
        urls.extend(sitemap_urls(surface, findings))

    pages: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for record, page_findings in executor.map(audit_page, urls):
            pages.append(record)
            findings.extend(page_findings)

    by_title: dict[str, list[str]] = defaultdict(list)
    by_description: dict[str, list[str]] = defaultdict(list)
    for page in pages:
        if page.get("title"):
            by_title[page["title"]].append(page["url"])
        if page.get("description"):
            by_description[page["description"]].append(page["url"])
    for code, values in (("DUPLICATE_TITLE", by_title), ("DUPLICATE_DESCRIPTION", by_description)):
        for value, duplicate_urls in values.items():
            if len(duplicate_urls) > 1:
                findings.append(Finding("warning", code, duplicate_urls[0], f"Shared by {len(duplicate_urls)} pages: {', '.join(duplicate_urls[1:4])}."))

    ordered = sorted(findings, key=lambda item: (item.severity != "error", item.code, item.url))
    errors = sum(item.severity == "error" for item in ordered)
    warnings = sum(item.severity == "warning" for item in ordered)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "surfaces": list(SURFACES),
        "summary": {"pages": len(pages), "errors": errors, "warnings": warnings},
        "pages": sorted(pages, key=lambda item: item["url"]),
        "findings": [asdict(item) for item in ordered],
    }
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2) + "\n")
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        write_markdown(args.markdown, report)

    print(f"Public surface audit: {len(pages)} pages · {errors} error(s) · {warnings} warning(s)")
    for finding in ordered:
        print(f"{finding.severity.upper()} {finding.code} {finding.url}: {finding.message}")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
