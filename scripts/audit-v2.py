"""Audit the complete /v2 static site without browser or third-party dependencies.

Run from any directory. Includes untracked pages, resolves HTML <base> correctly,
and follows referenced stylesheets for asset checks. This checks published HTML
and URL integrity; interactive behaviour and visual quality need browser review.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import json
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://proccyboi.github.io"
LOCAL_HOSTS = {"proccyboi.github.io", "localhost", "127.0.0.1"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

# Exact utility routes, not blanket exemptions for arbitrary future pages.
# Redirects must still resolve, and may not send visitors to old case studies.
UTILITY_EXEMPTIONS = {
    "v2/render/index.html": "Internal CAD capture surface (not a content page)",
}
REDIRECT_EXEMPTIONS = {
    "v2/projects/skylabs/flight-review/index.html": "Shared flight-review application redirect",
    "v2/lab/framework-esp32/index.html": "Legacy explorer redirect",
    "v2/lab/framework-dual-usb/index.html": "Legacy explorer redirect",
    "v2/lab/metroboard/index.html": "Legacy explorer redirect",
    "v2/lab/rf-test-board/index.html": "Legacy explorer redirect",
    "v2/lab/skylabs/index.html": "Legacy explorer redirect",
    "v2/lab/tramtrace/index.html": "Legacy explorer redirect",
}
SHARED_PREFIXES = ("/shared/", "/assets/", "/reports/", "/book/")
HARDWARE_CATALOG = ROOT / "scripts/content/hardware-catalog.json"


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    line: int
    ancestors: tuple[str, ...] = ()
    text: list[str] = field(default_factory=list)
    project_group: str | None = None


class Document(HTMLParser):
    def __init__(self, path: Path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.elements: list[Element] = []
        self.stack: list[Element] = []
        self.feed(path.read_text(encoding="utf-8-sig"))
        self.close()

    def handle_starttag(self, tag, attrs):
        item = Element(tag, {key: value or "" for key, value in attrs}, self.getpos()[0], tuple(parent.tag for parent in self.stack), project_group=next((parent.attrs["data-v2-project-group"] for parent in reversed(self.stack) if "data-v2-project-group" in parent.attrs), None))
        self.elements.append(item)
        if tag not in VOID:
            self.stack.append(item)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        for item in self.stack:
            item.text.append(data)

    def tags(self, tag):
        return [item for item in self.elements if item.tag == tag]

    @property
    def url(self):
        relative = self.path.relative_to(ROOT).as_posix()
        return ORIGIN + "/" + relative.removesuffix("index.html")

    @property
    def base(self):
        bases = self.tags("base")
        return urljoin(self.url, bases[0].attrs.get("href", "")) if bases else self.url

    @property
    def ids(self):
        return {item.attrs["id"] for item in self.elements if "id" in item.attrs}


def local_target(raw_url: str, base: str) -> tuple[Path, str, str] | None:
    """Return disk path, decoded fragment and normalized URL path, if local."""
    parsed = urlsplit(urljoin(base, raw_url.strip()))
    if parsed.scheme not in {"http", "https", ""} or parsed.hostname not in LOCAL_HOSTS:
        return None
    url_path = unquote(parsed.path)
    candidate = (ROOT / url_path.lstrip("/")).resolve()
    if not candidate.is_relative_to(ROOT):
        raise ValueError("URL escapes the site root")
    if parsed.path.endswith("/") or candidate.is_dir():
        candidate /= "index.html"
    return candidate, unquote(parsed.fragment), url_path


def source_set_urls(value: str):
    # URL tokens may contain commas (notably data URLs). Consume non-space URL
    # tokens first, then descriptors up to the separator, following srcset syntax.
    remaining = value.strip()
    while remaining:
        remaining = remaining.lstrip(" ,\t\r\n")
        if not remaining:
            break
        match = re.match(r"\S+", remaining)
        token = match.group()
        remaining = remaining[len(token):]
        if token.endswith(","):
            yield token.rstrip(",")
        else:
            yield token
            comma = remaining.find(",")
            remaining = remaining[comma + 1:] if comma >= 0 else ""


def css_urls(css: str):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for match in re.finditer(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*?))\s*\)", css, re.I):
        yield next(group for group in match.groups() if group is not None).strip()
    for match in re.finditer(r"@import\s+[\"']([^\"']+)[\"']", css, re.I):
        yield match.group(1)


def main() -> int:
    errors: list[str] = []
    documents: dict[Path, Document] = {}
    checked_css: set[Path] = set()
    checked_manifests: set[Path] = set()
    checked_targets: set[Path] = set()
    stats = Counter()

    def error(path: Path, message: str, line: int | None = None):
        location = path.relative_to(ROOT).as_posix()
        errors.append(f"{location}{':' + str(line) if line else ''}: {message}")

    def document(path: Path) -> Document | None:
        path = path.resolve()
        if path in documents:
            return documents[path]
        try:
            documents[path] = Document(path)
            return documents[path]
        except (OSError, UnicodeError, ValueError) as exc:
            error(path, f"cannot read HTML: {exc}")
            return None

    def reference(owner: Path, raw: str, base: str, line=None, navigation=False):
        if not raw.strip():
            error(owner, "empty URL reference", line)
            return
        stats["references"] += 1
        try:
            target = local_target(raw, base)
        except ValueError as exc:
            error(owner, f"invalid URL {raw!r}: {exc}", line)
            return
        if target is None:
            return
        path, fragment, url_path = target
        if navigation and not (url_path.startswith("/v2/") or url_path == "/v2" or url_path.startswith(SHARED_PREFIXES)):
            # Standalone file downloads are resources; HTML routes belong in v2.
            if path.suffix.lower() in {".html", ".htm", ""}:
                error(owner, f"navigation leaves /v2 for original site: {raw}", line)
        if not path.is_file():
            error(owner, f"missing local target: {raw} -> {path.relative_to(ROOT).as_posix()}", line)
            return
        checked_targets.add(path)
        if path.stat().st_size == 0:
            error(owner, f"empty local target: {raw}", line)
        if fragment and path.suffix.lower() in {".html", ".htm"}:
            target_doc = document(path)
            named_anchors = {item.attrs["name"] for item in target_doc.tags("a") if "name" in item.attrs} if target_doc else set()
            # Browser text fragments do not refer to an element ID.
            fragment = fragment.split(":~:text=", 1)[0]
            if fragment and target_doc and fragment not in target_doc.ids | named_anchors:
                error(owner, f"missing fragment: {raw}", line)
            stats["fragments"] += 1
        if path.suffix.lower() == ".css" and path not in checked_css:
            checked_css.add(path)
            try:
                css = path.read_text(encoding="utf-8-sig")
                css_base = ORIGIN + "/" + path.relative_to(ROOT).as_posix()
                for asset in css_urls(css):
                    # Fragment-only CSS URLs reference the consuming DOM, not
                    # a file in the stylesheet's directory.
                    if not asset.startswith("#"):
                        reference(path, asset, css_base)
            except (OSError, UnicodeError) as exc:
                error(path, f"cannot read CSS references: {exc}")
        if path.name == "assembly.json" and path.is_relative_to(ROOT / "assets/models") and path not in checked_manifests:
            checked_manifests.add(path)
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
                manifest_base = ORIGIN + "/" + path.relative_to(ROOT).as_posix()
                if manifest.get("boardManifest"):
                    reference(path, manifest['boardManifest'], manifest_base)
                    for part in manifest.get('parts', []):
                        reference(path, part.get('file', ''), manifest_base)
                else:
                    reference(path, manifest.get("modelUrl", ""), manifest_base)
                for key in ("frontUrl", "backUrl"):
                    if manifest.get("silk", {}).get(key):
                        reference(path, manifest["silk"][key], manifest_base)
                if not manifest.get('boardManifest') and len(manifest.get("boundsMm", [])) != 4:
                    error(path, "assembly requires four board bounds")
                if not manifest.get('boardManifest') and not isinstance(manifest.get("footprints"), list):
                    error(path, "assembly requires a footprint list")
            except (OSError, UnicodeError, ValueError) as exc:
                error(path, f"cannot read assembly manifest: {exc}")

    try:
        catalog = json.loads(HARDWARE_CATALOG.read_text(encoding="utf-8"))
        requested_projects = {"framework-raspberry-pi"} | {record["slug"] for record in catalog["projects"]}
        if len({record["slug"] for record in catalog["projects"]}) != len(catalog["projects"]):
            error(HARDWARE_CATALOG, "duplicate project slug in maintained catalog")
        public_models = {model['slug'] for record in catalog['projects'] for model in record.get('models', [{'slug': record['model']}])}
        public_models.update(record['model'] for record in catalog['assemblies'])
        for manifest in (ROOT / 'assets/models/hardware').glob('*/assembly.json'):
            if manifest.parent.name not in public_models:
                error(manifest, 'model is not in the public project catalog')
        model_catalog_path = ROOT / 'assets/models/hardware/catalog.json'
        model_catalog = json.loads(model_catalog_path.read_text(encoding='utf-8'))
        for record in model_catalog.get('boards', []):
            if record.get('exported') and record['slug'] not in public_models:
                error(model_catalog_path, f"exported model is not in the public project catalog: {record['slug']}")
    except (OSError, ValueError, KeyError) as exc:
        error(HARDWARE_CATALOG, f"cannot read project inventory: {exc}")
        requested_projects = {"framework-raspberry-pi"}

    original = document(ROOT / "projects/index.html")
    if original is None:
        print("\n".join(errors))
        return 1
    original_projects = set()
    for link in original.tags("a"):
        target = local_target(link.attrs.get("href", ""), original.base)
        match = re.fullmatch(r"/projects/([^/]+)/?", target[2]) if target else None
        if match:
            original_projects.add(match.group(1))

    pages = sorted((ROOT / "v2").rglob("*.html"))
    if not pages:
        error(ROOT / "v2", "no HTML pages found")
    if not (ROOT / "v2/index.html").is_file():
        error(ROOT / "v2", "missing /v2/ homepage")
    if not (ROOT / "v2/projects/index.html").is_file():
        error(ROOT / "v2", "missing /v2/projects/ index")

    v2_projects = {
        path.relative_to(ROOT / "v2/projects").parts[0]
        for path in pages
        if path.is_relative_to(ROOT / "v2/projects") and len(path.relative_to(ROOT / "v2/projects").parts) > 1
    }
    for slug in sorted(v2_projects - original_projects - requested_projects):
        error(ROOT / "v2/projects" / slug, "new project absent from existing public project inventory")
    for slug in sorted((original_projects | requested_projects) - v2_projects):
        error(ROOT / "v2/projects" / slug, "existing project missing from /v2")

    collection = document(ROOT / "v2/projects/index.html")
    collection_projects = set()
    category_counts = Counter()
    if collection:
        for link in collection.tags("a"):
            if "data-v2-project" not in link.attrs:
                continue
            target = local_target(link.attrs.get("href", ""), collection.base)
            match = re.fullmatch(r"/v2/projects/([^/]+)/?", target[2]) if target else None
            if match:
                if match.group(1) in collection_projects:
                    error(collection.path, f"duplicate collection project: {match.group(1)}", link.line)
                collection_projects.add(match.group(1))
                category_counts[link.project_group] += 1
                category_counts["all"] += 1
        if collection_projects != v2_projects:
            error(collection.path, f"collection and route inventory differ: {', '.join(sorted(collection_projects ^ v2_projects))}")
        for link in collection.tags("a"):
            if "data-v2-category" in link.attrs:
                count = re.search(r"(\d+)\s*$", "".join(link.text))
                expected = category_counts[link.attrs["data-v2-category"]]
                if not count or int(count.group(1)) != expected:
                    error(collection.path, f"category count must be {expected} for {link.attrs['data-v2-category']}", link.line)
    try:
        sitemap_urls = {node.text for node in ET.parse(ROOT / "sitemap.xml").iter() if node.tag.rsplit("}", 1)[-1] == "loc"}
        for slug in v2_projects:
            if f"{ORIGIN}/v2/projects/{slug}/" not in sitemap_urls:
                error(ROOT / "sitemap.xml", f"missing project route: {slug}")
        for url in sitemap_urls:
            if url and url.startswith(f'{ORIGIN}/v2/projects/'):
                relative = url.removeprefix(ORIGIN).strip('/')
                if not (ROOT / relative / 'index.html').is_file():
                    error(ROOT / 'sitemap.xml', f'sitemap points to an unpublished route: {relative}')
    except (OSError, ET.ParseError) as exc:
        error(ROOT / "sitemap.xml", f"cannot read sitemap: {exc}")

    for page in pages:
        doc = document(page)
        if doc is None:
            continue
        relative = page.relative_to(ROOT).as_posix()
        utility = relative in UTILITY_EXEMPTIONS
        refreshes = [item for item in doc.tags("meta") if item.attrs.get("http-equiv", "").lower() == "refresh"]
        redirect = relative in REDIRECT_EXEMPTIONS and bool(refreshes)
        exempt = utility or redirect
        if exempt:
            stats["explicit utility/redirect exemptions"] += 1
        ids = Counter(item.attrs["id"] for item in doc.elements if "id" in item.attrs)
        for identifier, count in ids.items():
            if count > 1:
                error(page, f"duplicate id {identifier!r} ({count} occurrences)")
        if not exempt:
            for tag in ("main", "h1"):
                if len(doc.tags(tag)) != 1:
                    error(page, f"expected exactly one {tag}, found {len(doc.tags(tag))}")
            if not any("".join(item.text).strip() for item in doc.tags("title")):
                error(page, "missing document title")
            if not any(item.attrs.get("name", "").lower() == "description" and item.attrs.get("content", "").strip() for item in doc.tags("meta")):
                error(page, "missing meta description")
            canonicals = [item for item in doc.tags("link") if "canonical" in item.attrs.get("rel", "").split()]
            if len(canonicals) != 1:
                error(page, f"expected exactly one canonical, found {len(canonicals)}")
            elif canonicals[0].attrs.get("href", "").rstrip("/") != doc.url.rstrip("/"):
                error(page, f"canonical must identify this v2 route: {doc.url}", canonicals[0].line)
            for meta in doc.tags("meta"):
                if meta.attrs.get("property") == "og:url" and meta.attrs.get("content", "").rstrip("/") != doc.url.rstrip("/"):
                    error(page, f"og:url must identify this v2 route: {doc.url}", meta.line)
            skips = [item for item in doc.tags("a") if "skip" in item.attrs.get("class", "").lower() or "".join(item.text).strip().lower().startswith("skip to")]
            if not skips:
                error(page, "missing skip-to-content link")
            for skip in skips:
                target = local_target(skip.attrs.get("href", ""), doc.base)
                main_ids = {item.attrs.get("id") for item in doc.tags("main")}
                if not target or target[0].resolve() != page.resolve() or not target[1] or target[1] not in main_ids:
                    error(page, "skip link must target this page's main landmark (including <base> resolution)", skip.line)

        for item in doc.elements:
            if item.tag == "img":
                stats["images"] += 1
                if "alt" not in item.attrs:
                    error(page, "image missing alt attribute", item.line)
                # Modal images are populated on open and do not reserve page
                # layout space. Registered SVG copper/mask overlays share the
                # sized PCB stage; their dimensions are set by that stage.
                modal_image = "dialog" in item.ancestors and "data-lightbox-image" in item.attrs
                pcb_overlay = "pcb-vector" in item.attrs.get("class", "").split() and item.attrs.get("alt") == ""
                if modal_image or pcb_overlay:
                    stats["non-flow image dimension exemptions"] += 1
                else:
                    for dimension in ("width", "height"):
                        if not re.fullmatch(r"[1-9]\d*", item.attrs.get(dimension, "")):
                            error(page, f"image needs positive integer {dimension} to reserve layout space", item.line)
                if not modal_image and not any(item.attrs.get(attr) for attr in ("src", "srcset")):
                    error(page, "image missing src/srcset", item.line)
            for attr in ("href", "src", "poster", "xlink:href", "data-hardware"):
                if attr in item.attrs and item.tag != "base":
                    reference(page, item.attrs[attr], doc.base, item.line, navigation=item.tag in {"a", "area"} and attr == "href")
            for attr in ("srcset", "imagesrcset"):
                if attr in item.attrs:
                    stats["responsive image sets"] += 1
                    for raw_url in source_set_urls(item.attrs[attr]):
                        reference(page, raw_url, doc.base, item.line)
            if item.tag == "meta" and item.attrs.get("property") in {"og:image", "og:video", "og:audio"}:
                reference(page, item.attrs.get("content", ""), doc.base, item.line)
            if "style" in item.attrs:
                for raw_url in css_urls(item.attrs["style"]):
                    reference(page, raw_url, doc.base, item.line)
            if item.tag == "style":
                for raw_url in css_urls("".join(item.text)):
                    reference(page, raw_url, doc.base, item.line)
        for refresh in refreshes:
            match = re.search(r"(?:^|;)\s*url\s*=\s*['\"]?([^'\"]+)", refresh.attrs.get("content", ""), re.I)
            if match:
                reference(page, match.group(1).strip(), doc.base, refresh.line, navigation=True)
            else:
                error(page, "refresh redirect has no resolvable URL", refresh.line)

    unique_errors = list(dict.fromkeys(errors))
    summary = (f"V2 audit: {len(pages)} HTML pages; {len(v2_projects)} projects ({len(original_projects)} existing + {len(requested_projects - original_projects)} requested); "
               f"{stats['images']} images; {stats['references']} URL references; {stats['fragments']} fragments; "
               f"{len(checked_css)} stylesheets; {len(checked_manifests)} assembly manifests; {len(checked_targets)} distinct local targets; "
               f"{stats['explicit utility/redirect exemptions']} explicit utility/redirect exemptions; "
               f"{stats['non-flow image dimension exemptions']} modal/PCB-overlay images.")
    print(summary)
    if unique_errors:
        print(f"FAIL: {len(unique_errors)} issue(s)")
        print("\n".join(unique_errors))
        return 1
    print("PASS: inventory, collection counts, sitemap, landmarks, metadata, skip links, images, assembly assets, fragments and v2 navigation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
