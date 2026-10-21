#!/usr/bin/env python3
"""Independent, read-only boundaries for the v3 WebGPU experiment.

Checks the working tree against a frozen pre-experiment commit, never regenerates
pages, and verifies route/content/form contracts against the current untouched v2.
This is structural evidence, not a claim of browser or graphics correctness.
"""
from __future__ import annotations

import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
BASE = "8e24c7d18bd745cdaf7b6b23ef87db8bb5f6ea33"
ORIGIN = "https://proccyboi.github.io"
# Exact support files are allowed; existing assets and all production/v2 routes
# are deliberately outside this list, including assets named v3-aircraft-*.
SUPPORT = {
    "scripts/build-v3-pages.py", "scripts/audit-v3.py",
    ".github/workflows/deploy-pages.yml", ".github/workflows/verify-v3-webgpu.yml",
    "docs/v3-webgpu.md",
}


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def allowed(path: str) -> bool:
    return path.startswith(("v3/", "scripts/v3-webgpu/")) or path in SUPPORT


def mapped(value: str) -> str:
    value = re.sub(r"^" + re.escape(ORIGIN) + r"/v2(?=/|[?#]|$)", ORIGIN + "/v3", value)
    return re.sub(r"^/v2(?=/|[?#]|$)", "/v3", value)


class Document(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self.nodes: list[tuple[str, dict[str, str | None]]] = []
        self.main_text: list[str] = []
        self.main_depth = 0
        self.ignore = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.nodes.append((tag, attrs))
        if tag == "main":
            self.main_depth += 1
        if tag in ("script", "style"):
            self.ignore += 1

    def handle_endtag(self, tag):
        if tag == "main":
            self.main_depth = max(0, self.main_depth - 1)
        if tag in ("script", "style"):
            self.ignore = max(0, self.ignore - 1)

    def handle_data(self, data):
        if self.main_depth and not self.ignore:
            text = " ".join(data.split())
            if text:
                self.main_text.append(text)

    def nodes_with(self, attr):
        return [(tag, attrs) for tag, attrs in self.nodes if attr in attrs]


def run(base: str, structure_only: bool = False) -> dict:
    errors: list[str] = []
    # The frozen boundary belongs to this migration's review, not every future
    # deployment: later authorized edits to production must remain possible.
    changed = [] if structure_only else git("diff", "--name-only", base, "--").decode().splitlines()
    untracked = [] if structure_only else git("ls-files", "--others", "--exclude-standard").decode().splitlines()
    forbidden = [name for name in changed + untracked if not allowed(name)]
    errors.extend(f"Outside v3 isolation boundary: {name}" for name in forbidden)
    protected = [] if structure_only else [name for name in git("ls-tree", "-r", "--name-only", base).decode().splitlines() if not allowed(name)]
    v2_pages = sorted((ROOT / "v2").rglob("*.html"))
    route_names = [str(page.relative_to(ROOT / "v2")) for page in v2_pages]
    v3_routes = {str(page.relative_to(ROOT / "v3")) for page in (ROOT / "v3").rglob("*.html") if "assets" not in page.relative_to(ROOT / "v3").parts}
    missing = set(route_names) - v3_routes
    errors.extend(f"Missing copied v2 route: /v3/{name}" for name in sorted(missing))
    references = 0
    for before_path in v2_pages:
        rel = before_path.relative_to(ROOT / "v2")
        after_path = ROOT / "v3" / rel
        if not after_path.exists():
            continue
        before = Document(before_path.read_text())
        after = Document(after_path.read_text())
        page_url = ORIGIN + "/v3/" + str(rel).removesuffix("index.html")
        base_url = next((attrs.get("href") for tag, attrs in after.nodes if tag == "base"), page_url)
        base_url = urljoin(page_url, base_url)
        ids = Counter(attrs["id"] for _, attrs in after.nodes_with("id"))
        errors.extend(f"{rel}: duplicate id {name}" for name, count in ids.items() if count > 1)
        for tag, attrs in after.nodes:
            for attr in ("href", "src", "poster"):
                value = attrs.get(attr)
                if not value or value.startswith(("mailto:", "tel:", "data:", "javascript:")):
                    continue
                url = urlsplit(urljoin(base_url, value))
                if url.netloc != urlsplit(ORIGIN).netloc:
                    continue
                references += 1
                if url.path == "/v2" or url.path.startswith("/v2/"):
                    errors.append(f"{rel}: {tag}[{attr}] leaves experiment for {value}")
                local = ROOT / unquote(url.path.lstrip("/"))
                if local.is_dir():
                    local /= "index.html"
                if not local.exists():
                    errors.append(f"{rel}: missing local {tag}[{attr}] {value}")
                elif url.fragment and local.suffix == ".html":
                    target = after if local == after_path else Document(local.read_text())
                    if url.fragment not in {a.get("id") for _, a in target.nodes}:
                        errors.append(f"{rel}: missing fragment in {value}")
        canonical = [attrs.get("href") for tag, attrs in after.nodes if tag == "link" and attrs.get("rel") == "canonical"]
        original_canonical = [mapped(attrs.get("href", "")) for tag, attrs in before.nodes if tag == "link" and attrs.get("rel") == "canonical"]
        if canonical != original_canonical:
            errors.append(f"{rel}: canonical route differs from v2-to-v3 mapping")
        # The experiment may replace/extend its homepage renderer, but existing
        # interior project facts and booking form text should remain intact.
        if str(rel) != "index.html" and before.main_text != after.main_text:
            errors.append(f"{rel}: copied interior main text differs from v2")
        for hook in ("data-v2-project", "data-booking-endpoint"):
            def values(doc):
                return Counter((tag, mapped(attrs.get("href", "")), attrs.get(hook)) for tag, attrs in doc.nodes_with(hook))
            if values(before) != values(after):
                errors.append(f"{rel}: {hook} inventory differs from v2")
        def form_fields(doc):
            return Counter((tag, attrs.get("name"), attrs.get("type"), attrs.get("value"), attrs.get("required"), attrs.get("maxlength")) for tag, attrs in doc.nodes if tag in ("input", "textarea", "select", "form"))
        if form_fields(before) != form_fields(after):
            errors.append(f"{rel}: form/field contract differs from v2")
    return {
        "baseline": base,
        "frozenIsolationChecked": not structure_only,
        "passed": not errors,
        "protectedTrackedFiles": len(protected),
        "copiedV2Routes": len(route_names),
        "localReferencesChecked": references,
        "changedFiles": changed,
        "newFiles": untracked,
        "errors": errors,
        "limits": "Static route/content/isolation checks only. Browser, renderer output, fallback, and performance require separate evidence.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=BASE)
    parser.add_argument("--structure-only", action="store_true", help="Deployment-safe route/content checks without freezing unrelated future repository work")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = run(args.base, args.structure_only)
    rendered = json.dumps(report, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n")
    print(rendered)
    raise SystemExit(0 if report["passed"] else 1)
