"""Run fast structural checks over the tracked static site."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
LANDMARK_EXEMPT = {
    Path("projects/skylabs/flight-review/index.html"),
    Path("reports/f110211/diagnostic.html"),
    Path("reports/f110211/index.html"),
    Path("shared/projects/skylabs/f110211/index.html"),
}


def tracked_html() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "*.html"],
        cwd=ROOT,
        capture_output=True,
        check=True,
        text=True,
    )
    return [ROOT / line for line in result.stdout.splitlines() if line]


def local_target(raw_url: str, base_href: str) -> tuple[Path, str] | None:
    parsed = urlsplit(urljoin(base_href, raw_url))
    if parsed.scheme or parsed.netloc or raw_url.startswith(("mailto:", "tel:", "data:")):
        return None
    path_text = unquote(parsed.path).lstrip("/")
    if not path_text:
        return ROOT / "index.html", parsed.fragment
    candidate = ROOT / path_text
    if raw_url.endswith("/") or candidate.is_dir():
        candidate /= "index.html"
    return candidate, parsed.fragment


def main() -> int:
    errors: list[str] = []
    checks = 0
    files = tracked_html()
    parsed_documents: dict[Path, html.HtmlElement] = {}

    for page in files:
        try:
            document = html.fromstring(page.read_text(encoding="utf-8"))
        except Exception as error:  # pragma: no cover - command-line reporting
            errors.append(f"{page.relative_to(ROOT)}: parse error: {error}")
            continue
        checks += 1  # parseability
        parsed_documents[page.resolve()] = document

        ids = document.xpath("//*[@id]/@id")
        duplicates = sorted({identifier for identifier in ids if ids.count(identifier) > 1})
        if duplicates:
            errors.append(f"{page.relative_to(ROOT)}: duplicate ids: {', '.join(duplicates)}")
        checks += 1  # unique identifiers

        relative_page = page.relative_to(ROOT)
        if relative_page not in LANDMARK_EXEMPT and len(document.xpath("//main")) != 1:
            errors.append(f"{page.relative_to(ROOT)}: expected exactly one main landmark")
        if relative_page not in LANDMARK_EXEMPT and len(document.xpath("//h1")) != 1:
            errors.append(f"{page.relative_to(ROOT)}: expected exactly one h1")
        checks += 1  # primary landmark and heading

        primary_navigation = document.xpath("//nav[contains(concat(' ', normalize-space(@class), ' '), ' site-nav ')]")
        if primary_navigation:
            current_items = primary_navigation[0].xpath(".//a[@aria-current='page']")
            expected_items = 0 if relative_page in {Path("index.html"), Path("404.html")} else 1
            if len(current_items) != expected_items:
                errors.append(
                    f"{page.relative_to(ROOT)}: expected {expected_items} current primary navigation item(s), found {len(current_items)}"
                )
        checks += 1  # current-page state in the primary navigation

        if relative_page not in LANDMARK_EXEMPT:
            title = document.xpath("string(//title)").strip()
            description = document.xpath("string(//meta[@name='description']/@content)").strip()
            if not title:
                errors.append(f"{page.relative_to(ROOT)}: missing document title")
            if not description:
                errors.append(f"{page.relative_to(ROOT)}: missing meta description")
        checks += 1  # route metadata, with explicit utility-page exemptions

        base_href = document.xpath("string(//base/@href)")
        if not base_href:
            parent = relative_page.parent.as_posix()
            base_href = f"/{parent}/" if parent != "." else "/"

        for image in document.xpath("//img"):
            if image.get("alt") is None:
                errors.append(f"{page.relative_to(ROOT)}: image missing alt text")
        checks += 1  # image alternatives

        for button in document.xpath("//button"):
            if not button.get("type"):
                errors.append(f"{page.relative_to(ROOT)}: button missing explicit type")
        checks += 1  # predictable button behaviour

        for external_window in document.xpath("//*[@target='_blank']"):
            relationship = set(external_window.get("rel", "").lower().split())
            if not relationship.intersection({"noopener", "noreferrer"}):
                errors.append(f"{page.relative_to(ROOT)}: target=_blank missing noopener or noreferrer")
        checks += 1  # safe new-window links

        for element in document.xpath("//*[@href or @src]"):
            attribute = "href" if element.get("href") is not None else "src"
            raw_url = element.get(attribute, "").strip()
            if not raw_url or raw_url.startswith("#"):
                continue
            target = local_target(raw_url, base_href)
            if target is None:
                continue
            target_path, _ = target
            if not target_path.exists():
                errors.append(f"{page.relative_to(ROOT)}: missing local target {raw_url}")
            elif target_path.is_file() and target_path.stat().st_size == 0:
                errors.append(f"{page.relative_to(ROOT)}: empty local target {raw_url}")

        for source_set in document.xpath("//*[@srcset]/@srcset"):
            for candidate in source_set.split(","):
                raw_url = candidate.strip().split()[0]
                target = local_target(raw_url, base_href)
                if target and not target[0].exists():
                    errors.append(f"{page.relative_to(ROOT)}: missing srcset target {raw_url}")
        checks += 1  # local links and media targets

    for page, document in parsed_documents.items():
        relative_page = page.relative_to(ROOT)
        base_href = document.xpath("string(//base/@href)")
        if not base_href:
            parent = relative_page.parent.as_posix()
            base_href = f"/{parent}/" if parent != "." else "/"
        for raw_url in document.xpath("//a[@href]/@href"):
            target = local_target(raw_url.strip(), base_href)
            if not target or not target[1]:
                continue
            target_path, fragment = target
            target_document = parsed_documents.get(target_path.resolve())
            if target_document is None:
                continue
            matches = target_document.xpath("//*[@id=$fragment or @name=$fragment]", fragment=fragment)
            if not matches:
                errors.append(f"{relative_page}: missing fragment target {raw_url}")
        checks += 1  # in-page and cross-page fragment destinations

    if errors:
        print("\n".join(errors))
        return 1
    print(f"Audited {len(files)} tracked HTML documents across {checks} review cells: structure, metadata and local assets OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
