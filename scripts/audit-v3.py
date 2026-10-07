"""Audit /v3 routes, metadata, assets and preservation of working v2 viewers.

Uses only the Python standard library. Browser interaction and visual checks
remain separate; this command checks the actual generated HTML, including
untracked files, without changing the site.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
import gzip
import re
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
PRIVATE_PROJECTS = {"kiku", "usense", "comp6441", "pcbnotebook"}


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    line: int
    ancestors: tuple[str, ...]
    text: list[str] = field(default_factory=list)


class Document(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.elements, self.stack = [], []
        self.feed(path.read_text(encoding="utf-8-sig"))
        self.close()

    def handle_starttag(self, tag, attrs):
        item = Element(tag, {key: value or "" for key, value in attrs}, self.getpos()[0], tuple(node.tag for node in self.stack))
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

    def handle_data(self, text):
        for item in self.stack:
            item.text.append(text)

    def tags(self, tag):
        return [item for item in self.elements if item.tag == tag]

    @property
    def url(self):
        return ORIGIN + "/" + self.path.relative_to(ROOT).as_posix().removesuffix("index.html")

    @property
    def base(self):
        bases = self.tags("base")
        return urljoin(self.url, bases[0].attrs.get("href", "")) if bases else self.url


def private_path(value):
    for part in unquote(value).lower().split("/"):
        normalized = re.sub(r"[^a-z0-9]", "", part)
        if any(normalized.startswith(name) for name in PRIVATE_PROJECTS):
            return True
    return False


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


def data_hooks(document, known_keys):
    return Counter((item.tag, tuple(sorted((key, value) for key, value in item.attrs.items() if key in known_keys))) for item in document.elements if any(key in known_keys for key in item.attrs))


def inline_scripts(document):
    return Counter((item.attrs.get("type", ""), sha256("".join(item.text).encode()).hexdigest()) for item in document.tags("script") if not item.attrs.get("src"))


def main():
    errors, stats = [], Counter()
    documents, canonicals = {}, {}
    checked_files, checked_css, checked_manifests, missing_files = set(), set(), set(), set()

    def error(path, message, line=None):
        label = path.relative_to(ROOT).as_posix()
        errors.append(f"{label}{':' + str(line) if line else ''}: {message}")

    def read_document(path):
        if path not in documents:
            documents[path] = Document(path)
        return documents[path]

    def reference(owner, raw, base, line=None):
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
        if not path.is_file():
            if path not in missing_files:
                missing_files.add(path)
                error(owner, f"missing local target {raw!r} -> {path.relative_to(ROOT).as_posix()}", line)
            return
        checked_files.add(path)
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
                for name in ["frontUrl", "backUrl"]:
                    if manifest.get("silk", {}).get(name):
                        reference(path, manifest["silk"][name], base_url)
            except (OSError, ValueError, TypeError) as exception:
                error(path, f"invalid model manifest: {exception}")

    pages = sorted(SITE.rglob("*.html"))
    sitemap = ROOT / "sitemap.xml"
    try:
        sitemap_urls = {item.text for item in ET.parse(sitemap).iter() if item.tag.rsplit("}", 1)[-1] == "loc"}
    except (OSError, ET.ParseError) as exception:
        error(sitemap, f"invalid sitemap: {exception}")
        sitemap_urls = set()
    for relative in ["index.html", "projects/index.html", "about/index.html"]:
        if not (SITE / relative).is_file():
            error(SITE / relative, "required route is missing")
    if (SITE / "render").exists():
        error(SITE / "render", "the internal v2 renderer must not become a v3 route")

    # Every existing public v2 interior must remain reachable beside the new
    # home page. This follows the maintained source inventory, not a hard count.
    for source in sorted((ROOT / "v2").rglob("index.html")):
        relative = source.relative_to(ROOT / "v2")
        if relative == Path("index.html") or relative.parts[0] == "render":
            continue
        if not (SITE / relative).is_file():
            error(SITE / relative, "existing public interior is missing from v3")

    for page in pages:
        try:
            doc = read_document(page)
        except (OSError, UnicodeError, ValueError) as exception:
            error(page, f"cannot parse page: {exception}")
            continue
        stats["pages"] += 1
        relative = page.relative_to(SITE).as_posix()
        if private_path(relative):
            error(page, "withheld project route must not be published")
        refreshes = [item for item in doc.tags("meta") if item.attrs.get("http-equiv", "").lower() == "refresh"]
        redirect = relative in REDIRECTS and bool(refreshes)
        if refreshes and not redirect:
            error(page, "unexpected redirect route")
        noindex = any(item.attrs.get("name", "").lower() == "robots" and "noindex" in item.attrs.get("content", "").lower() for item in doc.tags("meta"))
        indexable = not noindex and not redirect

        for identifier, count in Counter(item.attrs["id"] for item in doc.elements if "id" in item.attrs).items():
            if count > 1:
                error(page, f"duplicate id {identifier!r}")
        canonical = [item for item in doc.tags("link") if "canonical" in item.attrs.get("rel", "").split()]
        expected = ORIGIN + REDIRECTS[relative] if redirect else doc.url
        if len(canonical) != 1 or canonical[0].attrs.get("href", "").rstrip("/") != expected.rstrip("/"):
            error(page, f"expected one canonical identifying {expected}")
        else:
            value = canonical[0].attrs["href"].rstrip("/")
            if value in canonicals:
                error(page, f"duplicate canonical also used by {canonicals[value].relative_to(ROOT)}")
            canonicals[value] = page
        if indexable:
            stats["indexable"] += 1
            if doc.url not in sitemap_urls:
                error(page, "indexable route is missing from sitemap.xml")
            for tag in ["title", "h1", "main"]:
                nodes = doc.tags(tag)
                if len(nodes) != 1 or not "".join(nodes[0].text).strip():
                    error(page, f"expected one nonempty {tag}")
            descriptions = [item for item in doc.tags("meta") if item.attrs.get("name", "").lower() == "description" and item.attrs.get("content", "").strip()]
            if len(descriptions) != 1:
                error(page, "expected one nonempty meta description")
            og_urls = [item for item in doc.tags("meta") if item.attrs.get("property") == "og:url"]
            if len(og_urls) != 1 or og_urls[0].attrs.get("content", "").rstrip("/") != doc.url.rstrip("/"):
                error(page, "og:url must identify this v3 route")

        if not redirect:
            styles = [item for item in doc.tags("link") if "stylesheet" in item.attrs.get("rel", "").split()]
            if not styles or urlsplit(urljoin(doc.base, styles[-1].attrs.get("href", ""))).path != "/assets/v3.css":
                error(page, "v3.css must be the last stylesheet")
            elif any(item.tag == "style" and "head" in item.ancestors for item in doc.elements[doc.elements.index(styles[-1]) + 1:]):
                error(page, "a later inline stylesheet overrides the final v3 layer")
            bodies = doc.tags("body")
            if len(bodies) != 1 or "v3" not in bodies[0].attrs.get("class", "").split():
                error(page, "missing v3 body class")

        for item in doc.elements:
            if item.tag == "meta" and (item.attrs.get("property") == "og:image" or item.attrs.get("name") == "twitter:image"):
                reference(page, item.attrs.get("content", ""), doc.base, item.line)
            for name in ["href", "src", "poster"]:
                if name in item.attrs and item.tag != "base":
                    raw = item.attrs[name]
                    if urlsplit(urljoin(doc.base, raw)).path in {"/assets/v2-motion.js", "/assets/v2-motion.css"}:
                        error(page, "v2 generic motion must not be loaded", item.line)
                    reference(page, raw, doc.base, item.line)
            for name in ["srcset", "imagesrcset"]:
                if name in item.attrs:
                    for raw in srcset_urls(item.attrs[name]):
                        reference(page, raw, doc.base, item.line)
            for name, raw in item.attrs.items():
                if name.startswith("data-") and raw.startswith(("/assets/", "assets/", "/shared/")):
                    reference(page, raw, doc.base, item.line)
            if item.tag == "style":
                for raw in css_urls("".join(item.text)):
                    if not raw.startswith("#"):
                        reference(page, raw, doc.base, item.line)
        for refresh in refreshes:
            match = re.search(r"(?:^|;)\s*url\s*=\s*['\"]?([^'\"]+)", refresh.attrs.get("content", ""), re.I)
            if not match:
                error(page, "refresh has no destination", refresh.line)
            else:
                raw = match[1].strip()
                reference(page, raw, doc.base, refresh.line)
                if redirect and urlsplit(urljoin(doc.base, raw)).path != REDIRECTS[relative]:
                    error(page, "Flight Review redirect must retain the shared application destination", refresh.line)

        source = ROOT / "v2" / relative
        if relative != "index.html" and source.is_file():
            original = read_document(source)
            keys = {key for item in original.elements for key in item.attrs if key.startswith("data-")}
            missing_hooks = data_hooks(original, keys) - data_hooks(doc, keys)
            if missing_hooks:
                error(page, f"{sum(missing_hooks.values())} original viewer/tool data-hook elements were changed or removed")
            old_scripts = [item.attrs["src"] for item in original.tags("script") if item.attrs.get("src") and not item.attrs["src"].split("?", 1)[0].endswith("/v2-motion.js")]
            new_scripts = [item.attrs["src"] for item in doc.tags("script") if item.attrs.get("src") and not item.attrs["src"].split("?", 1)[0].endswith("/v3.js")]
            if old_scripts != new_scripts:
                error(page, "shared viewer/tool script sources or execution order differ from v2")
            if inline_scripts(original) - inline_scripts(doc):
                error(page, "an original inline simulation or model JSON block changed")
            stats["preserved interiors"] += 1

    # Aircraft assets are loaded by JavaScript rather than HTML. Check the
    # delivered mesh and its compressed copy against the export manifest.
    aircraft = ROOT / "assets/models/aircraft/skylabs-trainer/manifest.json"
    try:
        reference(SITE / "index.html", "/assets/v3-aircraft-hero.js", ORIGIN)
        reference(SITE / "index.html", "/assets/v3-aircraft-scene.js", ORIGIN)
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
        print("V3 audit failed:")
        print("\n".join(dict.fromkeys(errors)))
        return 1
    print(f'V3 audit passed: {stats["pages"]} routes, {stats["indexable"]} indexable pages, {stats["preserved interiors"]} preserved interiors, {len(checked_files)} local files and {len(checked_manifests)} model manifests ({stats["references"]} references).')
    return 0


if __name__ == "__main__":
    sys.exit(main())
