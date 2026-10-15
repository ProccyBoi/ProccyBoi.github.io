"""Audit the faithful v2-to-v3 product copy using only the standard library.

Checks source, route metadata, fragments, resource/manifest integrity and retained
viewer contracts. It does not run a browser or claim visual/performance parity.
Run verify-v3-product-preservation.py for the independent frozen-Git boundary.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import gzip
import json
import re
import runpy
import struct
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "v3"
ORIGIN = "https://proccyboi.github.io"
LOCAL_HOSTS = {"proccyboi.github.io", "localhost", "127.0.0.1"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
REDIRECTS = {"projects/skylabs/flight-review/index.html": "/shared/flight-review/"}
UTILITIES = {"render/index.html"}
PRIVATE_PROJECTS = {"usense", "comp6441", "pcbnotebook"}
PRODUCT_CSS = "/assets/v3-product.css"
LIGHT_INTERIORS_CSS = "/assets/v3-product-light-interiors.css"
CONTROLS_CSS = "/assets/v3-product-controls.css"
PRODUCT_JS = "/assets/v3-product.js"
NAV_HOOKS = {"data-v2-nav", "data-v2-menu"}
ASSEMBLY_CLONE = "/assets/v3-product-assembly.js"
SELECTED_CLONE = "/assets/v3-product-selected.js"
CLONE_SOURCES = {ASSEMBLY_CLONE: "/assets/v2-assembly.js", SELECTED_CLONE: "/assets/v2-selected-work.js", "/assets/v3-product-aircraft.js": "/assets/v3-aircraft-hero.js"}
LIGHT_POSTER_SOURCES = {f"/assets/images/v3-product/skylabs-{pose}{size}.webp?v=white-20261012": f"/assets/images/v3/skylabs-{pose}{size}.webp?v=sky-20261008" for pose in ("approach", "stopped") for size in ("", "-mobile")}


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    line: int
    ancestors: tuple[str, ...]
    start: int
    end: int
    text: list[str] = field(default_factory=list)


class Document(HTMLParser):
    def __init__(self, path, source=None):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.source = path.read_text(encoding="utf-8-sig") if source is None else source
        self.lines = [0] + [match.end() for match in re.finditer("\n", self.source)]
        self.elements, self.stack = [], []
        self.feed(self.source)
        self.close()

    def position(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        start = self.position()
        item = Element(tag, {key: value or "" for key, value in attrs}, self.getpos()[0], tuple(node.tag for node in self.stack), start, start + len(self.get_starttag_text()))
        self.elements.append(item)
        if tag not in VOID:
            self.stack.append(item)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                self.stack[index].end = self.source.index(">", self.position()) + 1
                del self.stack[index:]
                break

    def handle_data(self, text):
        for item in self.stack:
            item.text.append(text)

    def tags(self, tag):
        return [item for item in self.elements if item.tag == tag]

    def raw(self, node):
        return self.source[node.start:node.end]

    @property
    def url(self):
        return ORIGIN + "/" + self.path.relative_to(ROOT).as_posix().removesuffix("index.html")

    @property
    def base(self):
        bases = self.tags("base")
        return urljoin(self.url, bases[0].attrs.get("href", "")) if bases else self.url


def route(value):
    """Rewrite route prefixes, never the /assets/images/v2/ asset namespace."""
    return re.sub(r"(?<![\w./-])(?:https://proccyboi\.github\.io)?/v2(?=/|[?#\"'\s]|$)", lambda match: match[0].replace("/v2", "/v3"), value)


def private_path(value):
    return any(any(re.sub(r"[^a-z0-9]", "", part).startswith(name) for name in PRIVATE_PROJECTS) for part in unquote(value).lower().split("/"))


def target(raw, base):
    parsed = urlsplit(urljoin(base, raw.strip()))
    if parsed.scheme not in {"http", "https", ""} or parsed.hostname not in LOCAL_HOSTS:
        return None
    url_path = unquote(parsed.path)
    path = (ROOT / url_path.lstrip("/")).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError("URL escapes the website root")
    if url_path.endswith("/") or path.is_dir():
        path /= "index.html"
    return path, url_path


def srcset_urls(value):
    remaining = value.strip()
    while remaining:
        remaining = remaining.lstrip(" ,\t\r\n")
        if not remaining:
            return
        token = re.match(r"\S+", remaining).group()
        remaining = remaining[len(token):]
        yield token.rstrip(",")
        if not token.endswith(","):
            separator = remaining.find(",")
            remaining = remaining[separator + 1:] if separator >= 0 else ""


def css_urls(source):
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    for match in re.finditer(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*?))\s*\)", source, re.I):
        yield next(group for group in match.groups() if group is not None).strip()
    for match in re.finditer(r"@import\s+[\"']([^\"']+)[\"']", source, re.I):
        yield match[1]


def script_contract(document):
    result = []
    for item in document.tags("script"):
        if not item.attrs.get("src"):
            continue
        attrs = dict(item.attrs)
        source = urljoin(document.base, attrs["src"])
        path = urlsplit(source).path
        if path in {"/assets/v2.js", PRODUCT_JS}:
            continue  # Explicit replacement of only the presentation/nav controller.
        if path in CLONE_SOURCES:
            # Explicit v3-only UI/routing copies occupy the original execution
            # slots. Their dedicated source tests cover preserved render/pacing
            # bodies; this audit does not claim whole-clone byte identity.
            attrs["src"] = CLONE_SOURCES[path]
        elif path in CLONE_SOURCES.values():
            attrs["src"] = path
        else:
            attrs["src"] = source
        result.append(tuple(sorted(attrs.items())))
    return result


def inline_scripts(document):
    return Counter((item.attrs.get("type", ""), sha256(route("".join(item.text)).encode()).hexdigest()) for item in document.tags("script") if not item.attrs.get("src"))


def data_hooks(document, keys):
    return Counter((item.tag, tuple(sorted((key, route(LIGHT_POSTER_SOURCES.get(value, value))) for key, value in item.attrs.items() if key in keys))) for item in document.elements if any(key in keys for key in item.attrs))


def payloads(document):
    """Payload URLs and fetch hints are not an editorial presentation layer."""
    result = Counter()
    hints = {"loading", "decoding", "fetchpriority", "width", "height", "sizes", "media", "type", "as", "crossorigin"}
    for item in document.elements:
        values = []
        if item.tag in {"img", "source", "video", "audio", "iframe", "object"}:
            values = [(key, value) for key, value in item.attrs.items() if key in {"src", "srcset", "poster", "data"} | hints]
        if item.tag == "link" and set(item.attrs.get("rel", "").split()) & {"preload", "prefetch", "modulepreload"}:
            values = [(key, value) for key, value in item.attrs.items() if key in {"href", "imagesrcset", "imagesizes", "rel"} | hints]
        if values:
            # Only the four original responsive aircraft plates may be replaced
            # by new renders of the same source geometry on the light studio.
            values = [(key, LIGHT_POSTER_SOURCES.get(value, value)) for key, value in values]
            result[(item.tag, tuple(sorted(values)))] += 1
    return result


def check_copy_preservation():
    errors, stats = [], Counter()
    sources = {path.relative_to(ROOT / "v2").as_posix(): path for path in (ROOT / "v2").rglob("*.html")}
    destinations = {path.relative_to(SITE).as_posix(): path for path in SITE.rglob("*.html")}
    if len(sources) != 27:
        errors.append(f"v2/: expected the approved 27-route source inventory, found {len(sources)}")
    for relative in sorted(sources.keys() - destinations.keys()):
        errors.append(f"v3/{relative}: current v2 route has no v3 counterpart")
    for relative in sorted(destinations.keys() - sources.keys()):
        errors.append(f"v3/{relative}: route has no current-v2 source; review before adding")
    for relative in sorted(sources.keys() & destinations.keys()):
        original, copied = Document(sources[relative]), Document(destinations[relative])
        label = f"v3/{relative}"
        keys = {key for item in original.elements for key in item.attrs if key.startswith("data-")} - NAV_HOOKS
        if relative == "index.html":
            # The duplicate caption link is intentionally removed; the single
            # visible Open control, title, canvas and scene hooks remain.
            keys.discard("data-assembly-link")
            keys.discard("data-framework-background")
            # V2's independent control cleanup moves its title hook onto h2
            # and names its Open label. V3 retains the same title and action
            # with its own presentation hooks; enforce exactly one of each.
            keys.difference_update({"data-assembly-title", "data-assembly-open-label"})
            for document, title_hook, open_hook in ((original, "data-assembly-title", "data-assembly-open-label"), (copied, "data-assembly-title", "data-product-open-label")):
                for hook in (title_hook, open_hook):
                    if sum(hook in item.attrs for item in document.elements) != 1:
                        errors.append(f"{label}: expected one retained {hook}")
        missing = data_hooks(original, keys) - data_hooks(copied, keys)
        if missing:
            errors.append(f"{label}: {sum(missing.values())} original viewer, tool or evidence data-hook elements changed or disappeared")
        original_ids = {item.attrs["id"] for item in original.elements if "id" in item.attrs} - {"v2-navigation"}
        new_ids = {item.attrs["id"] for item in copied.elements if "id" in item.attrs}
        if original_ids - new_ids:
            errors.append(f"{label}: original section/control IDs missing: {', '.join(sorted(original_ids - new_ids))}")
        if script_contract(original) != script_contract(copied):
            errors.append(f"{label}: shared script URLs, execution attributes or source order differ from v2")
        if inline_scripts(original) - inline_scripts(copied):
            errors.append(f"{label}: original inline startup, simulation or JSON block changed")
        original_styles = [urljoin(original.base, item.attrs.get("href", "")) for item in original.tags("link") if "stylesheet" in item.attrs.get("rel", "").split() and urlsplit(urljoin(original.base, item.attrs.get("href", ""))).path != "/assets/v2-home-controls.css"]
        retained_styles = [urljoin(copied.base, item.attrs.get("href", "")) for item in copied.tags("link") if "stylesheet" in item.attrs.get("rel", "").split() and urlsplit(urljoin(copied.base, item.attrs.get("href", ""))).path not in {PRODUCT_CSS, CONTROLS_CSS, LIGHT_INTERIORS_CSS}]
        if original_styles != retained_styles:
            errors.append(f"{label}: original stylesheet stack/order changed")
        expected_payloads = payloads(original)
        if relative == "index.html" and "data-framework-background" in original.source:
            # V2 now presents only Framework cards. V3 deliberately retains its
            # previously approved transit chapter, exactly including its images.
            retained = [node for node in copied.tags("section") if node.attrs.get("id") == "work-transit"]
            if len(retained) != 1 or sha256(copied.raw(retained[0]).strip().encode()).hexdigest() != "6bf3b4f65993f85dfa85c14e725bb7cd866de25575a53590db096ff1fd66a3da":
                errors.append(f"{label}: independently retained transit chapter changed")
            else:
                expected_payloads += payloads(Document(destinations[relative], copied.raw(retained[0])))
        if expected_payloads != payloads(copied):
            errors.append(f"{label}: image/model/iframe payload URLs or loading priorities changed")
        for node in original.elements:
            if "data-v2-engineering-evidence" in node.attrs:
                if route(original.raw(node)) not in copied.source:
                    errors.append(f"{label}: source-backed Engineering notes were changed or removed")
        if relative != "index.html":
            for main in original.tags("main"):
                if route(original.raw(main)) not in copied.source:
                    errors.append(f"{label}: copied main content differs beyond v2-to-v3 route substitutions")
            stats["interiors"] += 1
        if relative == "projects/index.html":
            expected = Counter(route(item.attrs.get("href", "")) for item in original.elements if "data-v2-project" in item.attrs)
            actual = Counter(item.attrs.get("href", "") for item in copied.elements if "data-v2-project" in item.attrs)
            if expected != actual or sum(actual.values()) != 16:
                errors.append(f"{label}: collection must retain all 16 current-v2 projects exactly once")
            stats["catalog projects"] = sum(actual.values())
        stats["routes"] += 1
    clone = ROOT / ASSEMBLY_CLONE.lstrip("/")
    if clone.exists() and re.search(r"href\s*:\s*[\"']/v2/projects/", clone.read_text()):
        errors.append("assets/v3-product-assembly.js: runtime project links still navigate to v2")
    return errors, stats


def main():
    errors, stats = check_copy_preservation()
    documents, canonicals = {}, {}
    checked_files, checked_css, checked_manifests, missing_files = set(), set(), set(), set()

    def error(path, message, line=None):
        label = path.relative_to(ROOT).as_posix()
        errors.append(f"{label}{':' + str(line) if line else ''}: {message}")

    def read_document(path):
        if path not in documents:
            documents[path] = Document(path)
        return documents[path]

    def reference(owner, raw, base, line=None, navigation=False):
        if not raw.strip():
            error(owner, "empty local resource or navigation reference", line)
            return
        stats["references"] += 1
        try:
            resolved = target(raw, base)
        except ValueError as exception:
            error(owner, f"invalid reference {raw!r}: {exception}", line)
            return
        if resolved is None:
            return
        path, url_path = resolved
        if private_path(url_path):
            error(owner, f"reference exposes a withheld project: {raw}", line)
        if navigation and (url_path == "/v2" or url_path.startswith("/v2/")):
            error(owner, f"project/navigation link accidentally leaves v3: {raw}", line)
        if navigation and (url_path == "/" or url_path.startswith(("/projects/", "/about/", "/book/"))):
            error(owner, f"portfolio navigation must use the copied v3 route: {raw}", line)
        if not path.is_file():
            if path not in missing_files:
                missing_files.add(path)
                error(owner, f"missing local target {raw!r} -> {path.relative_to(ROOT).as_posix()}", line)
            return
        checked_files.add(path)
        fragment = unquote(urlsplit(urljoin(base, raw.strip())).fragment).split(":~:text=", 1)[0]
        if fragment and path.suffix.lower() == ".html":
            destination = read_document(path)
            if not any(item.attrs.get("id") == fragment or (item.tag == "a" and item.attrs.get("name") == fragment) for item in destination.elements):
                error(owner, f"missing HTML fragment {raw!r}", line)
        if not path.stat().st_size:
            error(owner, f"empty local target: {raw}", line)
        if path.suffix.lower() == ".css" and path not in checked_css:
            checked_css.add(path)
            base_url = ORIGIN + "/" + path.relative_to(ROOT).as_posix()
            for asset in css_urls(path.read_text(encoding="utf-8-sig")):
                if not asset.startswith("#"):
                    reference(path, asset, base_url)
        if path.name == "assembly.json" and path.is_relative_to(ROOT / "assets/models") and path not in checked_manifests:
            checked_manifests.add(path)
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
                base_url = ORIGIN + "/" + path.relative_to(ROOT).as_posix()
                if manifest.get("boardManifest"):
                    reference(path, manifest["boardManifest"], base_url)
                    for part in manifest.get("parts", []):
                        reference(path, part.get("file", ""), base_url)
                else:
                    reference(path, manifest.get("modelUrl", ""), base_url)
                    if len(manifest.get("boundsMm", [])) != 4 or not isinstance(manifest.get("footprints"), list):
                        error(path, "assembly requires original board bounds and footprint inventory")
                for name in ["frontUrl", "backUrl"]:
                    if manifest.get("silk", {}).get(name):
                        reference(path, manifest["silk"][name], base_url)
            except (OSError, ValueError, TypeError) as exception:
                error(path, f"invalid model manifest: {exception}")

    try:
        sitemap_urls = {item.text for item in ET.parse(ROOT / "sitemap.xml").iter() if item.tag.rsplit("}", 1)[-1] == "loc"}
    except (OSError, ET.ParseError) as exception:
        error(ROOT / "sitemap.xml", f"invalid sitemap: {exception}")
        sitemap_urls = set()
    for page in sorted(SITE.rglob("*.html")):
        doc = read_document(page)
        relative = page.relative_to(SITE).as_posix()
        if private_path(relative):
            error(page, "withheld project route must not be published")
        refreshes = [item for item in doc.tags("meta") if item.attrs.get("http-equiv", "").lower() == "refresh"]
        redirect = relative in REDIRECTS
        utility = relative in UTILITIES
        if bool(refreshes) != redirect:
            error(page, "missing approved redirect or unexpected redirect route")
        noindex = any(item.attrs.get("name", "").lower() == "robots" and "noindex" in item.attrs.get("content", "").lower() for item in doc.tags("meta"))
        if (utility or redirect) != noindex:
            error(page, "only the renderer and shared-app redirect may be noindex")
        for identifier, count in Counter(item.attrs["id"] for item in doc.elements if "id" in item.attrs).items():
            if count > 1:
                error(page, f"duplicate id {identifier!r}")
        bases = doc.tags("base")
        if len(bases) > 1 or (bases and doc.base != ORIGIN + "/"):
            error(page, "base must be the original root base, never a /v2 or /v3 asset base")
        canonical = [item for item in doc.tags("link") if "canonical" in item.attrs.get("rel", "").split()]
        expected = ORIGIN + REDIRECTS[relative] if redirect else doc.url
        if not utility:
            if len(canonical) != 1 or canonical[0].attrs.get("href", "").rstrip("/") != expected.rstrip("/"):
                error(page, f"expected one canonical identifying {expected}")
            elif expected in canonicals:
                error(page, f"duplicate canonical also used by {canonicals[expected].relative_to(ROOT)}")
            else:
                canonicals[expected] = page
        if not noindex:
            stats["indexable"] += 1
            theme_colors = [item.attrs.get("content") for item in doc.tags("meta") if item.attrs.get("name") == "theme-color"]
            if theme_colors != ["#fff"]:
                error(page, "light v3 browser chrome must use one explicit white theme-color")
            if doc.url not in sitemap_urls:
                error(page, "indexable v3 route is missing from sitemap.xml")
            for tag in ["title", "h1", "main"]:
                nodes = [item for item in doc.tags(tag) if tag != "title" or "head" in item.ancestors]
                if len(nodes) != 1 or not "".join(nodes[0].text).strip():
                    error(page, f"expected one nonempty {tag}")
            descriptions = [item for item in doc.tags("meta") if item.attrs.get("name", "").lower() == "description" and item.attrs.get("content", "").strip()]
            if len(descriptions) != 1:
                error(page, "expected one nonempty meta description")
            og_urls = [item for item in doc.tags("meta") if item.attrs.get("property") == "og:url"]
            if len(og_urls) != 1 or og_urls[0].attrs.get("content", "").rstrip("/") != doc.url.rstrip("/"):
                error(page, "og:url must identify this v3 route")
            styles = [item for item in doc.tags("link") if "stylesheet" in item.attrs.get("rel", "").split()]
            final_style = PRODUCT_CSS if relative == "index.html" else LIGHT_INTERIORS_CSS
            if not styles or urlsplit(urljoin(doc.base, styles[-1].attrs.get("href", ""))).path != final_style:
                error(page, "the scoped product/light-interior layer must be the final stylesheet")
            elif any(item.tag == "style" and "head" in item.ancestors for item in doc.elements[doc.elements.index(styles[-1]) + 1:]):
                error(page, "later inline stylesheet overrides the final product layer")
            if relative == "index.html" and (len(styles) < 2 or urlsplit(urljoin(doc.base, styles[-2].attrs.get("href", ""))).path != CONTROLS_CSS):
                error(page, "home controls stylesheet must follow inherited styles immediately before product.css")
            scripts = [urlsplit(urljoin(doc.base, item.attrs["src"])).path for item in doc.tags("script") if item.attrs.get("src")]
            if scripts.count(PRODUCT_JS) != 1 or "/assets/v2.js" in scripts:
                error(page, "exactly one product navigation controller must replace v2.js")
            if relative == "index.html" and any(scripts.count(clone) != 1 for clone in CLONE_SOURCES):
                error(page, "home must load each approved v3-only scene controller once")
            bodies = doc.tags("body")
            if len(bodies) != 1 or "v3-product" not in bodies[0].attrs.get("class", "").split():
                error(page, "missing scoped v3-product body class")
        elif doc.url in sitemap_urls:
            error(page, "utility/redirect must stay out of the sitemap")
        for item in doc.elements:
            if item.tag == "meta" and (item.attrs.get("property") == "og:image" or item.attrs.get("name") == "twitter:image"):
                reference(page, item.attrs.get("content", ""), doc.base, item.line)
            for name in ["href", "src", "poster", "action"]:
                if name in item.attrs and item.tag != "base":
                    reference(page, item.attrs[name], doc.base, item.line, item.tag in {"a", "area", "form"})
            for name in ["srcset", "imagesrcset"]:
                if name in item.attrs:
                    for raw in srcset_urls(item.attrs[name]):
                        reference(page, raw, doc.base, item.line)
            for name, raw in item.attrs.items():
                if name.startswith("data-") and raw.startswith(("/assets/", "assets/", "/shared/")):
                    for asset in (srcset_urls(raw) if name.endswith("srcset") else [raw]):
                        reference(page, asset, doc.base, item.line)
            if item.tag == "style":
                for raw in css_urls("".join(item.text)):
                    if not raw.startswith("#"):
                        reference(page, raw, doc.base, item.line)
            if item.tag == "script" and item.attrs.get("type") == "application/ld+json":
                try:
                    data = json.loads("".join(item.text))
                    def check_json(value):
                        if isinstance(value, dict):
                            for child in value.values(): check_json(child)
                        elif isinstance(value, list):
                            for child in value: check_json(child)
                        elif isinstance(value, str) and (value.startswith(ORIGIN) or value.startswith("/")):
                            reference(page, value, doc.base, item.line, navigation=True)
                    check_json(data)
                except (ValueError, TypeError) as exception:
                    error(page, f"invalid JSON-LD: {exception}", item.line)
        for refresh in refreshes:
            match = re.search(r"(?:^|;)\s*url\s*=\s*['\"]?([^'\"]+)", refresh.attrs.get("content", ""), re.I)
            if not match or urlsplit(urljoin(doc.base, match[1].strip())).path != REDIRECTS.get(relative):
                error(page, "Flight Review redirect must retain the shared application destination", refresh.line)
            else:
                reference(page, match[1].strip(), doc.base, refresh.line)

    # New presentation assets may reuse the maintained runtime, but must not
    # hide a new withheld-project URL or unresolved literal asset dependency.
    for asset in sorted((ROOT / "assets").glob("v3-product*")):
        if not asset.is_file() or asset.suffix not in {".js", ".css"}:
            continue
        source = asset.read_text(encoding="utf-8-sig")
        for raw in re.findall(r"[\"']((?:https://proccyboi\.github\.io)?/(?:assets|v2|v3|shared)/[^\"'\s]*)[\"']", source):
            if private_path(urlsplit(raw).path):
                error(asset, f"new presentation source references a withheld project: {raw}")
            if urlsplit(raw).path.startswith(("/assets/", "/shared/")):
                reference(asset, raw, ORIGIN)

    # Dynamic packs do not appear in HTML. Validate their exact original CAD
    # bytes and compressed transport, retaining v2's index-plane decoder.
    decode_transport = runpy.run_path(str(ROOT / "scripts/audit-v2.py"))["decode_hero_transport"]
    for family in ["hero", "selected"]:
        pack_manifest = ROOT / f"assets/models/{family}/manifest.json"
        try:
            pack = json.loads(pack_manifest.read_text())
            required = {"tramtrace", "telemetry", "pi"} if family == "hero" else {"esp32", "dual", "logic", "metro"}
            if set(pack["models"]) != required:
                error(pack_manifest, "current-v2 model inventory changed")
            for model in pack["models"].values():
                reference(pack_manifest, model["compressedUrl"], ORIGIN)
                compressed = target(model["compressedUrl"], ORIGIN)[0].read_bytes()
                plain = decode_transport(compressed)
                if sha256(plain).hexdigest() != model["sha256"] or len(plain) != model["bytes"] or len(compressed) != model["gzipBytes"]:
                    error(pack_manifest, "model bytes or compressed size differ from the manifest")
                if model.get("compressedSha256") and sha256(compressed).hexdigest() != model["compressedSha256"]:
                    error(pack_manifest, "compressed model hash differs from the manifest")
                for raw in model.get("textures", []): reference(pack_manifest, raw, ORIGIN)
                if family == "hero":
                    reference(pack_manifest, model["url"], ORIGIN)
                    if target(model["url"], ORIGIN)[0].read_bytes() != plain:
                        error(pack_manifest, "hero transport differs from its original uncompressed CAD")
                    if model.get("legacyCompressedUrl"):
                        reference(pack_manifest, model["legacyCompressedUrl"], ORIGIN)
                        if gzip.decompress(target(model["legacyCompressedUrl"], ORIGIN)[0].read_bytes()) != plain:
                            error(pack_manifest, "legacy hero transport differs from its original CAD")
                stats["prepared model packs"] += 1
        except (OSError, ValueError, KeyError, TypeError, EOFError) as exception:
            error(pack_manifest, f"cannot verify prepared model packs: {exception}")
    # Aircraft assets are loaded by JavaScript rather than HTML. Check the
    # delivered mesh and its compressed copy against the export manifest.
    aircraft = ROOT / "assets/models/aircraft/skylabs-trainer/manifest.json"
    try:
        reference(SITE / "index.html", "/assets/v3-product-aircraft.js", ORIGIN)
        reference(SITE / "index.html", "/assets/v3-aircraft-scene.js", ORIGIN)
        reference(SITE / "index.html", "/assets/v3-product-atmosphere.js", ORIGIN)
        reference(SITE / "index.html", "/assets/models/aircraft/skylabs-trainer/manifest.json", ORIGIN)
        manifest = json.loads(aircraft.read_text(encoding="utf-8"))
        manifest_url = ORIGIN + "/" + aircraft.relative_to(ROOT).as_posix()
        for key in ["model", "compressedModel"]:
            reference(aircraft, manifest[key], manifest_url)
        model = (aircraft.parent / manifest["model"]).read_bytes()
        compressed = (aircraft.parent / manifest["compressedModel"]).read_bytes()
        if gzip.decompress(compressed) != model:
            error(aircraft, "compressed aircraft differs from the original mesh")
        if sha256(model).hexdigest() != manifest["asset"]["sha256"]:
            error(aircraft, "aircraft mesh differs from its recorded export")
        if len(model) != manifest["asset"]["bytes"] or len(compressed) != manifest["asset"]["gzipBytes"]:
            error(aircraft, "aircraft asset sizes differ from the manifest")
        if struct.unpack_from("<III", model) != (0x46546C67, 2, len(model)):
            error(aircraft, "invalid aircraft GLB header")
        json_size, json_type = struct.unpack_from("<II", model, 12)
        if json_type != 0x4E4F534A:
            error(aircraft, "aircraft GLB is missing its scene description")
        scene = json.loads(model[20:20 + json_size])
        node_names = {node.get("name") for node in scene["nodes"]}
        source_parts = manifest["parts"]
        if len(source_parts) != 117 or len({part["id"] for part in source_parts}) != 117:
            error(aircraft, "source aircraft assembly occurrence inventory changed")
        if any(part["nodeName"] not in node_names for part in source_parts):
            error(aircraft, "an original aircraft occurrence is absent from the delivered scene")
        if manifest["units"] != "metres" or manifest["axes"] != {"nose": "+X", "up": "+Y", "span": "+Z"}:
            error(aircraft, "aircraft coordinate contract changed")
        if manifest["source"]["sha256"] != "676da89f79adc6d0e3cf81c1d9c64e46f1a60c7e108d24fccf6682b63607a158":
            error(aircraft, "aircraft no longer identifies the supplied STEP source")
        if manifest["completion"]["sourceOnly"] or not manifest["completion"]["reconstruction"]:
            error(aircraft, "completed aircraft needs its reconstructed parts recorded")
        transport = manifest["transport"]
        for key in ["model", "compressedModel", "decoder"]:
            reference(aircraft, transport[key], manifest_url)
        reference(aircraft, "transport-parity.json", manifest_url)
        packed = (aircraft.parent / transport["model"]).read_bytes()
        packed_gzip = (aircraft.parent / transport["compressedModel"]).read_bytes()
        decoder = (ROOT / transport["decoder"].lstrip("/")).read_bytes()
        if gzip.decompress(packed_gzip) != packed or sha256(packed).hexdigest() != transport["sha256"]:
            error(aircraft, "aircraft transport differs from its recorded export")
        if sha256(decoder).hexdigest() != transport["decoderSha256"]:
            error(aircraft, "aircraft decoder differs from the verified version")
        if transport["sourceGlbSha256"] != manifest["asset"]["sha256"] or not transport["lossless"] or transport["quantized"]:
            error(aircraft, "aircraft transport must preserve the current completed mesh")
        if len(packed_gzip) >= len(compressed):
            error(aircraft, "aircraft transport must reduce download size")
        stats["aircraft source occurrences"] = len(source_parts)
    except (OSError, ValueError, KeyError, TypeError, struct.error, EOFError) as exception:
        error(aircraft, f"cannot verify aircraft assets: {exception}")

    # Retain integrity checks for the archived manufacturing study's assets;
    # they are still published for reuse, but no longer drive the home page.
    manufacturing = ROOT / "assets/models/manufacturing/tramtrace/manufacturing.json"
    try:
        reference(SITE / "index.html", "/assets/v3-manufacturing.js", ORIGIN)
        reference(SITE / "index.html", "/assets/models/manufacturing/tramtrace/manufacturing.json", ORIGIN)
        manifest = json.loads(manufacturing.read_text(encoding="utf-8"))
        manifest_url = ORIGIN + "/" + manufacturing.relative_to(ROOT).as_posix()
        for asset in manifest["assets"].values():
            reference(manufacturing, asset, manifest_url)
        for name, expected in manifest["assetSha256"].items():
            path = manufacturing.parent / name
            data = path.read_bytes().replace(b"\r\n", b"\n")
            if sha256(data).hexdigest() != expected:
                error(manufacturing, f"manufacturing layer changed; rebuild registration: {name}")
        components = manifest["components"]
        refs = {component["ref"] for component in components}
        if len(components) != 143 or len(refs) != 143 or sum(ref.startswith("LED") for ref in refs) != 116:
            error(manufacturing, "manufacturing component inventory differs from the source board")
        if manifest["pasteApertures"] != 611 or manifest["boardSizeMm"] != [207.81, 1.6, 94.55]:
            error(manufacturing, "manufacturing geometry or paste registration changed")
    except (OSError, ValueError, KeyError, TypeError) as exception:
        error(manufacturing, f"cannot verify manufacturing assets: {exception}")

    if errors:
        print("V3 source audit failed (no browser checks were run):")
        print("\n".join(dict.fromkeys(errors)))
        return 1
    print(f'V3 source audit passed: {stats["routes"]} routes, {stats["indexable"]} indexable pages, {stats["interiors"]} copied interiors, {stats["catalog projects"]} catalog projects, {len(checked_files)} local files, {len(checked_manifests)} assembly manifests and {stats["prepared model packs"]} prepared model packs ({stats["references"]} references).')
    print("Static source/asset checks only; browser, accessibility, visual and performance checks are separate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
