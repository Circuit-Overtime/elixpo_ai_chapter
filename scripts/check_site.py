"""Check that the package artifact preserves its routes and crawl contract."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

SITE_URL = "https://packages.elixpo.com/"
SITEMAP_URL = f"{SITE_URL}sitemap.xml"
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
with open("content/packages.json", encoding="utf-8") as registry_file:
    registry = json.load(registry_file)

LINUX_SLUGS = [record["slug"] for record in registry["linuxApplications"]]
NATIVE_SLUGS = [record["slug"] for record in registry["nativeTools"]]
NPM_SLUGS = [record["slug"] for record in registry["npmPackages"]]
PUBLIC_ROUTES = [
    "repository/",
    *(f"{slug}/" for slug in [*LINUX_SLUGS, *NATIVE_SLUGS, *NPM_SLUGS]),
    *(f"{slug}/{section}/" for slug in LINUX_SLUGS for section in ("docs", "about")),
]


class HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.links: dict[str, str] = {}
        self.title = ""
        self._in_title = False
        self._in_json_ld = False
        self._json_ld_buffer: list[str] = []
        self.json_ld: list[object] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "meta":
            key = attributes.get("name") or attributes.get("property")
            if key:
                self.meta[key] = attributes.get("content") or ""
        elif tag == "link" and attributes.get("rel"):
            self.links[attributes["rel"]] = attributes.get("href") or ""
        elif tag == "title":
            self._in_title = True
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            self.json_ld.append(json.loads("".join(self._json_ld_buffer)))

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif self._in_json_ld:
            self._json_ld_buffer.append(data)


def check_site(site: Path) -> None:
    robots = (site / "robots.txt").read_text(encoding="utf-8")
    rules = [line.strip() for line in robots.splitlines() if line.strip()]
    normalized_rules = {rule.casefold() for rule in rules}
    assert "user-agent: *" in normalized_rules, "robots.txt has no wildcard user-agent"
    assert "allow: /" in normalized_rules, "robots.txt does not allow the public site"
    assert "disallow: /" not in normalized_rules, "robots.txt blocks the entire site"
    assert f"sitemap: {SITEMAP_URL}".casefold() in normalized_rules, (
        "robots.txt does not advertise the canonical sitemap"
    )

    sitemap = ET.parse(site / "sitemap.xml")
    urls = [node.text for node in sitemap.findall(f"{SITEMAP_NS}url/{SITEMAP_NS}loc")]
    expected_urls = {SITE_URL, *(f"{SITE_URL}{route}" for route in PUBLIC_ROUTES)}
    assert set(urls) == expected_urls, f"Unexpected sitemap URLs: {urls}"

    pages = [(site / "index.html", SITE_URL)] + [
        (site / route / "index.html", f"{SITE_URL}{route}") for route in PUBLIC_ROUTES
    ]
    for path, expected_url in pages:
        head = HeadParser()
        head.feed(path.read_text(encoding="utf-8"))
        assert head.title.strip(), f"Missing title in {path}"
        assert head.links.get("canonical") == expected_url, (
            f"Unexpected canonical URL in {path}: {head.links.get('canonical')!r}"
        )
        robots_meta = {part.strip().lower() for part in head.meta.get("robots", "").split(",")}
        assert "index" in robots_meta and "noindex" not in robots_meta, (
            f"Page is not indexable: {path} ({sorted(robots_meta)})"
        )
        assert head.meta.get("description"), f"Missing meta description in {path}"
        assert head.meta.get("og:url") == expected_url, (
            f"Unexpected Open Graph URL in {path}: {head.meta.get('og:url')!r}"
        )
        assert head.meta.get("og:title"), f"Missing Open Graph title in {path}"
        assert head.meta.get("og:description"), f"Missing Open Graph description in {path}"
        assert head.meta.get("og:image"), f"Missing Open Graph image in {path}"
        assert head.meta.get("twitter:card") == "summary_large_image", (
            f"Unexpected Twitter card in {path}: {head.meta.get('twitter:card')!r}"
        )
        assert head.json_ld, f"Missing structured data in {path}"

        if expected_url.rstrip("/").split("/")[-1] in {*LINUX_SLUGS, *NATIVE_SLUGS, *NPM_SLUGS}:
            nodes = [
                node
                for document in head.json_ld
                for node in (
                    document.get("@graph", [])
                    if isinstance(document, dict) and "@graph" in document
                    else [document]
                )
                if isinstance(node, dict)
            ]
            package_types = {"SoftwareApplication", "SoftwareSourceCode"}
            assert any(node.get("@type") in package_types for node in nodes), (
                f"Missing package structured data in {path}"
            )
            assert any(node.get("@type") == "BreadcrumbList" for node in nodes), (
                f"Missing breadcrumbs structured data in {path}"
            )

    for name in (
        "favicon.ico",
        "favicon.png",
        "info.css",
        "og-image.png",
        "feed.xml",
        "_headers",
        "install.sh",
        "win-dot-panel/install.sh",
        "screenbridge/install.sh",
        "crumb/install.sh",
        "screenbridge/icon.svg",
    ):
        assert (site / name).is_file(), f"Missing public file: {name}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", type=Path, help="Assembled static catalogue and package artifact")
    args = parser.parse_args()
    try:
        check_site(args.site)
    except (AssertionError, OSError, ET.ParseError) as error:
        print(f"Site crawl check failed: {error}", file=sys.stderr)
        return 1
    print("Site crawl files are present and consistent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
