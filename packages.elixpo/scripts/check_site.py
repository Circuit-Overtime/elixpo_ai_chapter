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
NPM_SLUGS = [record["slug"] for record in registry["npmPackages"]]
PUBLIC_ROUTES = [
    "repository/",
    *(f"{slug}/" for slug in [*LINUX_SLUGS, *NPM_SLUGS]),
    *(f"{slug}/{section}/" for slug in LINUX_SLUGS for section in ("docs", "about")),
]


class HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.links: dict[str, str] = {}
        self.title = ""
        self._in_title = False

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

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def check_site(site: Path) -> None:
    robots = (site / "robots.txt").read_text(encoding="utf-8")
    rules = [line.strip() for line in robots.splitlines() if line.strip()]
    assert "User-agent: *" in rules
    assert "Allow: /" in rules
    assert "Disallow: /" not in rules
    assert f"Sitemap: {SITEMAP_URL}" in rules

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
        assert head.links.get("canonical") == expected_url
        robots_meta = {part.strip().lower() for part in head.meta.get("robots", "").split(",")}
        assert "index" in robots_meta and "noindex" not in robots_meta
        assert head.meta.get("description")
        assert head.meta.get("og:url") == expected_url
        assert head.meta.get("og:title")
        assert head.meta.get("og:description")
        assert head.meta.get("og:image")
        assert head.meta.get("twitter:card") == "summary_large_image"

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
